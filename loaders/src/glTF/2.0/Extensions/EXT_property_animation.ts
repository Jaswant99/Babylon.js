import { Nullable } from "babylonjs/types";
import { Animation } from 'babylonjs/Animations/animation';
import { IGLTFLoaderExtension } from "../glTFLoaderExtension";
import { GLTFLoader, ArrayItem } from "../glTFLoader";
import { IAnimation, IArrayItem, IGLTF, IAnimationSampler } from "../glTFLoaderInterfaces";
import { AnimationGroup } from "babylonjs/Animations/animationGroup";
import { Vector2, Vector3, Quaternion, Color3 } from "babylonjs/Maths/math";
import { IAnimationKey, AnimationKeyInterpolation } from 'babylonjs/Animations/animationKey';
import {  AnimationSamplerInterpolation } from "babylonjs-gltf2interface";
import { Material } from "babylonjs/Materials/material";
import { Light } from "babylonjs/Lights/light";
import * as GLTF2 from "babylonjs-gltf2interface";

const NAME = "EXT_property_animation";

interface IEXTPropertyAnimationChannel extends IArrayItem {
    sampler: number;
    target: string;
}
interface IEXTPropertyAnimation {
    channels: IEXTPropertyAnimationChannel[];
}

interface IEXTPropertyAnimationTarget {
    targetPath: string;
    animationType: number;
    object: any;
}

interface IEXTPropertyAnimationSamplerData {
    input: Float32Array;
    interpolation: GLTF2.AnimationSamplerInterpolation;
    output: Float32Array;
}

/**
 * [Specification](https://github.com/najadojo/glTF/tree/EXT_property_animation/extensions/2.0/Vendor/EXT_property_animation)
 */
export class EXT_property_animation implements IGLTFLoaderExtension {
    /** The name of this extension. */
    public readonly name = NAME;

    /** Defines whether this extension is enabled. */
    public enabled = true;

    private _loader: GLTFLoader;

    /** @hidden */
    constructor(loader: GLTFLoader) {
        this._loader = loader;
    }

    /** @hidden */
    public dispose() {
        delete this._loader;
    }

    /** @hidden */
    public loadAnimationAsync(context: string, animation: IAnimation): Nullable<Promise<AnimationGroup>> {
        return GLTFLoader.LoadExtensionAsync<IEXTPropertyAnimation, AnimationGroup>(context, animation, this.name, (extensionContext, extension) => {
            return this._loader.loadAnimationAsync(context, animation).then(() => {
                const promises = new Array<Promise<any>>();
                let babylonAnimationGroup = animation._babylonAnimationGroup;

                for (const channel of extension.channels) {
                    promises.push(this._loadAnimationChannelAsync(`${extensionContext}/channels/${channel.index}`, context, animation, channel, babylonAnimationGroup!));
                }

                return Promise.all(promises).then(() => {
                    babylonAnimationGroup!.normalize();
                    return babylonAnimationGroup!;
                });
            });
        });
    }

    private _loadAnimationChannelAsync(context: string, animationContext: string, animation: IAnimation, channel: IEXTPropertyAnimationChannel, babylonAnimationGroup: AnimationGroup):  Promise<void> {
        const sampler = ArrayItem.Get(`${context}/sampler`, animation.samplers, channel.sampler);
        return this._loadAnimationSamplerAsync(`${animationContext}/samplers/${channel.sampler}`, sampler).then((data) => {
            const target = this._getAnimationObject(context, animationContext, channel.target);

            let outputBufferOffset = 0;
            let getNextOutputValue: () => number | Vector2 | Vector3 | Quaternion | Color3;
            switch (target.animationType) {
                case Animation.ANIMATIONTYPE_VECTOR2: {
                    getNextOutputValue = () => {
                        const value = Vector2.FromArray(data.output, outputBufferOffset);
                        outputBufferOffset += 2;
                        return value;
                    };
                    break;
                }
                case Animation.ANIMATIONTYPE_VECTOR3: {
                    getNextOutputValue = () => {
                        const value = Vector3.FromArray(data.output, outputBufferOffset);
                        outputBufferOffset += 3;
                        return value;
                    };
                    break;
                }
                case Animation.ANIMATIONTYPE_QUATERNION: {
                    getNextOutputValue = () => {
                        const value = Quaternion.FromArray(data.output, outputBufferOffset);
                        outputBufferOffset += 4;
                        return value;
                    };
                    break;
                }
                case Animation.ANIMATIONTYPE_COLOR3: {
                    getNextOutputValue = () => {
                        const value = Color3.FromArray(data.output, outputBufferOffset);
                        outputBufferOffset += 3;
                        return value;
                    };
                    break;
                }
                case Animation.ANIMATIONTYPE_COLOR4: {
                    getNextOutputValue = () => {
                        const value = Color3.FromArray(data.output, outputBufferOffset);
                        outputBufferOffset += 4;
                        return value;
                    };
                    break;
                }
                case Animation.ANIMATIONTYPE_FLOAT: {
                    getNextOutputValue = () => {
                        return data.output[outputBufferOffset++];
                    };
                    break;
                }
            }

            let getNextKey: (frameIndex: number) => IAnimationKey;
            switch (data.interpolation) {
                case AnimationSamplerInterpolation.STEP: {
                    getNextKey = (frameIndex) => ({
                        frame: data.input[frameIndex],
                        value: getNextOutputValue(),
                        interpolation: AnimationKeyInterpolation.STEP
                    });
                    break;
                }
                case AnimationSamplerInterpolation.LINEAR: {
                    getNextKey = (frameIndex) => ({
                        frame: data.input[frameIndex],
                        value: getNextOutputValue()
                    });
                    break;
                }
                case AnimationSamplerInterpolation.CUBICSPLINE: {
                    getNextKey = (frameIndex) => ({
                        frame: data.input[frameIndex],
                        inTangent: getNextOutputValue(),
                        value: getNextOutputValue(),
                        outTangent: getNextOutputValue()
                    });
                    break;
                }
            }

            const keys = new Array(data.input.length);
            for (let frameIndex = 0; frameIndex < data.input.length; frameIndex++) {
                keys[frameIndex] = getNextKey!(frameIndex);
            }

            const animationName = `${babylonAnimationGroup.name}_${NAME}_channel${babylonAnimationGroup.targetedAnimations.length}`;
            const babylonAnimation = new Animation(animationName, target.targetPath, 1, target.animationType);
            babylonAnimation.setKeys(keys);

            if (target.object != undefined) {
                babylonAnimationGroup.addTargetedAnimation(babylonAnimation, target.object);
            }

            if (target.animationType == Animation.ANIMATIONTYPE_COLOR4) {
                outputBufferOffset = 3;
                getNextOutputValue = () => {
                    const value = data.output[outputBufferOffset];
                    outputBufferOffset += 4;
                    return value;
                };
                const alphaKeys = new Array(data.input.length);
                for (let frameIndex = 0; frameIndex < data.input.length; frameIndex++) {
                    alphaKeys[frameIndex] = getNextKey!(frameIndex);
                }

                const alphaAnimationName = `${babylonAnimationGroup.name}_${NAME}_channel${babylonAnimationGroup.targetedAnimations.length}_alpha`;
                const alphaBabylonAnimation = new Animation(alphaAnimationName, 'alpha', 1, Animation.ANIMATIONTYPE_FLOAT);
                alphaBabylonAnimation.setKeys(alphaKeys);

                if (target.object != undefined) {
                    babylonAnimationGroup.addTargetedAnimation(alphaBabylonAnimation, target.object);
                }
            }
        });
    }

    private _loadAnimationSamplerAsync(context: string, sampler: IAnimationSampler): Promise<IEXTPropertyAnimationSamplerData> {
        if (sampler._data) {
            return sampler._data;
        }

        const interpolation = sampler.interpolation || AnimationSamplerInterpolation.LINEAR;
        switch (interpolation) {
            case AnimationSamplerInterpolation.STEP:
            case AnimationSamplerInterpolation.LINEAR:
            case AnimationSamplerInterpolation.CUBICSPLINE: {
                break;
            }
            default: {
                throw new Error(`${context}/interpolation: Invalid value (${sampler.interpolation})`);
            }
        }

        const inputAccessor = ArrayItem.Get(`${context}/input`, this._loader.gltf.accessors, sampler.input);
        const outputAccessor = ArrayItem.Get(`${context}/output`, this._loader.gltf.accessors, sampler.output);
        sampler._data = Promise.all([
            this._loader._loadFloatAccessorAsync(`/accessors/${inputAccessor.index}`, inputAccessor),
            this._loader._loadFloatAccessorAsync(`/accessors/${outputAccessor.index}`, outputAccessor)
        ]).then(([inputData, outputData]) => {
            return {
                input: inputData,
                interpolation: interpolation,
                output: outputData,
            };
        });

        return sampler._data;
    }

    /** dummy*/
    pathProperties: any = {
        extensions: {
            KHR_lights: {
                lights: {
                    _isIndexed: true,
                    _getTarget: function(gltf: IGLTF, index: number) {
                        for (const node of gltf.nodes!) {
                            if (node.extensions && node.extensions!.KHR_lights && node.extensions.KHR_LIGHTS!.light == index) {
                                let lights = node!._babylonTransformNode!.getChildren((childNode) => { return childNode instanceof Light; });
                                if (lights.length > 0) {
                                    return lights[0];
                                }
                            }
                        }
                        return undefined;
                    },
                    color: {
                        _typedKeyframeTrack: Animation.ANIMATIONTYPE_COLOR3,
                        _targetPath: 'diffuse'
                    },
                    intensity: {
                        _typedKeyframeTrack: Animation.ANIMATIONTYPE_FLOAT,
                        _targetPath: 'intensity'
                    },
                    // innerConeAngle: {
                    //     _typedKeyframeTrack: Animation.ANIMATIONTYPE_FLOAT,
                    //     _targetPath: 'innerConeAngle'
                    // },
                    // outerConeAngle: {
                    //     _typedKeyframeTrack: Animation.ANIMATIONTYPE_FLOAT,
                    //     _targetPath: 'outerConeAngle'
                    // }
                }
            }
        },
        materials: {
            _isIndexed: true,
            _getTarget: function(gltf: IGLTF, index: number) {
                return ArrayItem.Get(`/materials`, gltf.materials, index)._data![Material.TriangleFillMode].babylonMaterial;
            },
            pbrMetallicRoughness: {
                baseColorFactor: {
                    _animationType: Animation.ANIMATIONTYPE_COLOR4,
                    _targetPath: 'albedoColor'
                },
                metallicFactor: {
                    _animationType: Animation.ANIMATIONTYPE_FLOAT,
                    _targetPath: 'metallic'
                },
                roughnessFactor: {
                    _animationType: Animation.ANIMATIONTYPE_FLOAT,
                    _targetPath: 'roughness'
                },
                baseColorTexture: {
                    extensions: {
                        KHR_texture_transform: {
                            offset: {
                                _animationType: Animation.ANIMATIONTYPE_VECTOR2,
                                _targetPath: 'albedoTexture.uvOffset'
                            },
                            scale: {
                                _animationType: Animation.ANIMATIONTYPE_VECTOR2,
                                _targetPath: 'albedoTexture.uvScale'
                            }
                        }
                    }
                }
            },
            emissiveFactor: {
                _animationType: Animation.ANIMATIONTYPE_COLOR3,
                _targetPath: 'emissive'
            }
        }
    };

    private _getAnimationObject(context: string, animationContext: string, target: string): IEXTPropertyAnimationTarget {
        let result: IEXTPropertyAnimationTarget = {
            targetPath: '',
            animationType: 0,
            object: null
        };

        let pathPartNode = this.pathProperties;
        let targetPaths: string[] = [];
        const pathParts = target.split('/');
        for (let pathIndex = 0, pathPartsLength = pathParts.length; pathIndex < pathPartsLength; pathIndex ++) {
            let pathPart = pathParts[ pathIndex ];
            if (pathPart === '') {
                continue;
            }

            pathPartNode = pathPartNode[pathPart];

            if (pathPartNode === undefined) {
                throw new Error(`${context}: Invalid ${NAME} target path (${target})`);
            }

            if (pathPartNode._isIndexed) {
                pathPart = pathParts[++pathIndex];

                if (pathPartNode._getTarget !== undefined) {

                    result.object = pathPartNode._getTarget(this._loader.gltf, pathPart);
                    if (result.object == undefined) {
                        throw new Error(`${context}: Invalid ${NAME} target path (${target})`);
                    }
                }
            }

            if (pathPartNode._targetPath !== undefined) {
                targetPaths.push(pathPartNode._targetPath);
                //result.object = result.object[ pathPartNode._targetPath ];
            }

            if (pathPartNode._animationType !== undefined) {
                result.animationType = pathPartNode._animationType;
            }
        }

        result.targetPath = targetPaths.join('.');
        return result;
    }
}

GLTFLoader.RegisterExtension(NAME, (loader) => new EXT_property_animation(loader));
