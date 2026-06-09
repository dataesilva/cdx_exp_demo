import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// Path to the bunny.drc model within the public directory.
const MODEL_PATH = './media/dracos/bunny.drc';

/**
 * Creates and loads a Draco-compressed GLTF model (bunny.drc).
 * The model will be normalized so its base is at y=0 within its own group.
 *
 * @returns {Promise<THREE.Group>} A promise that resolves with the loaded model's Group.
 */
export async function createDracoModel() {
  const dracoLoader = new DRACOLoader();
  // Set the path to the Draco decoder. This can be a CDN or a local path
  // if the draco decoders are bundled with the application (e.g., in public/draco/).
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      MODEL_PATH,
      (gltf) => {
        const model = gltf.scene;
        model.name = 'DracoBunny';

        // Calculate bounding box to adjust position so its base is at y=0
        // within its own group, simplifying external positioning.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.y -= (center.y - size.y / 2);

        resolve(model);
      },
      undefined, // onProgress callback
      (error) => {
        console.error('An error happened while loading the Draco model:', error);
        reject(error);
      }
    );
  });
}
