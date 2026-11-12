import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import type { Scene } from "@babylonjs/core/scene";

export interface RenderPipeline {
  /** Turn the whole post-processing chain on or off, e.g. to compare cost. */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/**
 * Post-processing for a cinematic, moody look, kept deliberately light:
 *
 * - HDR rendering with filmic (ACES) tone mapping, so bright lanterns and
 *   moonlit surfaces roll off instead of clipping, and shadows stay deep.
 * - A restrained bloom on the brightest pixels only: lanterns, embers,
 *   glowing eyes and fungi.
 * - MSAA plus FXAA for clean edges on foliage and thin geometry.
 * - A soft vignette and a touch more contrast.
 *
 * Depth of field, motion blur and screen-space reflections are left out on
 * purpose: they cost the most and help a third-person action view the least.
 */
export function createRenderPipeline(
  scene: Scene,
  camera: Camera,
): RenderPipeline {
  const pipeline = new DefaultRenderingPipeline(
    "cinematic",
    true, // HDR
    scene,
    [camera],
  );

  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.72;
  pipeline.bloomWeight = 0.32;
  pipeline.bloomKernel = 56;
  pipeline.bloomScale = 0.5;

  const image = pipeline.imageProcessing;
  image.toneMappingEnabled = true;
  image.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  // ACES darkens the mid-tones; lift exposure to compensate.
  image.exposure = 1.2;
  image.contrast = 1.1;
  image.vignetteEnabled = true;
  image.vignetteWeight = 1.7;
  image.vignetteStretch = 0.4;
  image.vignetteColor = new Color4(0.01, 0.012, 0.02, 1);

  return {
    setEnabled(enabled) {
      if (enabled) {
        scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
          pipeline.name,
          [camera],
        );
      } else {
        scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(
          pipeline.name,
          [camera],
        );
      }
    },
    dispose: () => pipeline.dispose(),
  };
}
