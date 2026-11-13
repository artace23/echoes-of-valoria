import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { EXRCubeTexture } from "@babylonjs/core/Materials/Textures/exrCubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";

/** Resolution of each face of the cube used for lighting. Lighting is soft, so small is enough. */
const LIGHTING_FACE_SIZE = 128;
/** Resolution of each face of the visible sky. */
const SKY_FACE_SIZE = 512;
/**
 * Turns the sky so its moon sits where the moon light comes from. Found by
 * sweeping the rotation and measuring brightness along the light's
 * direction; the light and the picture of the moon are otherwise unrelated.
 */
const SKY_ROTATION = 4.05;

export interface Sky {
  /** How strongly the sky lights physically based materials. */
  setLightingIntensity(intensity: number): void;
}

/**
 * A night sky from an HDR panorama: the visible backdrop, and the source of
 * image-based lighting and reflections for physically based materials.
 *
 * The sky is drawn without fog, so it stays visible above the treeline while
 * distant scenery still fades into the fog.
 */
export function createSky(scene: Scene, url: string): Sky {
  // Lighting: a small, prefiltered copy.
  const lighting = new EXRCubeTexture(
    url,
    scene,
    LIGHTING_FACE_SIZE,
    false, // keep mipmaps: rough surfaces sample the blurrier levels
    true, // generate harmonics for diffuse lighting
    false,
    true, // prefilter on load
  );
  lighting.rotationY = SKY_ROTATION;
  scene.environmentTexture = lighting;
  scene.environmentIntensity = 0.5;

  // Backdrop: a sharper copy on a box that follows the camera.
  const backdrop = new EXRCubeTexture(
    url,
    scene,
    SKY_FACE_SIZE,
    true,
    false,
    false,
    false,
  );
  backdrop.rotationY = SKY_ROTATION;
  backdrop.coordinatesMode = Texture.SKYBOX_MODE;

  const material = new StandardMaterial("night-sky", scene);
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.reflectionTexture = backdrop;
  material.fogEnabled = false;

  const box = CreateBox("night-sky", { size: 120 }, scene);
  box.material = material;
  box.infiniteDistance = true;
  box.isPickable = false;
  box.applyFog = false;
  // Never culled, and never part of shadows or collisions.
  box.alwaysSelectAsActiveMesh = true;

  return {
    setLightingIntensity(intensity) {
      scene.environmentIntensity = intensity;
    },
  };
}
