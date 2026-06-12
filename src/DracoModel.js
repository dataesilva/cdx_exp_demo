import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const MODEL_PATH = './media/dracos/bunny.drc';

export async function createDracoModel() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');

  return new Promise((resolve, reject) => {
    dracoLoader.load(
      MODEL_PATH,
      (geometry) => {
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6, metalness: 0.1 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'DracoBunny';
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Normalize so the base sits at y=0 within its parent, simplifying external positioning.
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        mesh.position.y -= (center.y - size.y / 2);

        resolve(mesh);
      },
      undefined,
      (error) => {
        console.error('An error happened while loading the Draco model:', error);
        reject(error);
      }
    );
  });
}
