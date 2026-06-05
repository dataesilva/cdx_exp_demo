import * as Depthkit from 'depthkit';

/**
 * Create a Depthkit volumetric player.
 *
 * Expects a Depthkit "Texture Mesh Sequence" export made with the WebXR preset:
 *
 *   media/video/MyClip.mp4      <- color + texture video
 *   media/video/MyClip/         <- Draco mesh sequence
 *     mesh-f00001.drc
 *     mesh-f00002.drc
 *     ...
 *
 * `clipPath` is the path WITHOUT the extension/trailing slash, served from
 * Vite's `public/` root, e.g. './media/video/MyClip'.
 *
 * By default the player autoplays, loops, and adds itself to the scene when its
 * first frame is ready (handy for quick single-clip tests). The Timeline passes
 * `{ autoplay:false, loop:false, autoAdd:false }` and drives playback itself via
 * the returned `add`/`remove` handles and `player.video`.
 *
 * @param {import('three').Scene} scene
 * @param {string} clipPath
 * @param {{ autoplay?: boolean, loop?: boolean, autoAdd?: boolean }} [opts]
 * @returns {{ player: any, video: HTMLVideoElement, update: () => void,
 *            add: () => void, remove: () => void }}
 */
export function createDepthkitPlayer(scene, clipPath, opts = {}) {
  const { autoplay = true, loop = true, autoAdd = true } = opts;
  let added = false;

  const player = new Depthkit.DracoMeshSequencePlayer({
    clip: clipPath,
    autoplay,
    loop,
    readyStateChangeCallback: () => {
      if (
        autoAdd &&
        !added &&
        player.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        scene.add(player);
        added = true;
      }
    },
  });

  // The Depthkit color/depth video carries no usable audio — audio is a
  // separate timeline track — so keep it muted to satisfy autoplay policies.
  player.video.muted = true;

  return {
    player,
    video: player.video,
    // Call every frame while the clip is active so the player advances.
    update() {
      player.updateReadyState();
      // Once the mesh exists, let it cast/receive the showroom's shadows.
      if (player.mesh && !player.mesh.castShadow) {
        player.mesh.castShadow = true;
        player.mesh.receiveShadow = true;
      }
    },
    add() {
      if (!added) {
        scene.add(player);
        added = true;
      }
    },
    remove() {
      if (added) {
        scene.remove(player);
        added = false;
      }
    },
  };
}
