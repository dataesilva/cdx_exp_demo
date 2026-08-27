import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

let font = null;

/**
 * Creates a 3D text mesh.
 * @param {string} textContent - The string content of the text.
 * @param {THREE.Scene} scene - The Three.js scene to add the text to.
 * @param {THREE.Vector3} position - The world position for the text.
 * @param {number} size - The size of the text.
 * @param {number} height - The extrusion height of the text.
 * @param {number} rotationY - The Y-axis rotation of the text.
 * @returns {Promise<THREE.Mesh>} A promise that resolves with the text mesh.
 */
export async function createFloatingText(textContent, scene, position, size = 1.0,
    height = 0.1, rotationY = .5) {
    if (!font) {
        const loader = new FontLoader();
        font = await new Promise((resolve, reject) => {
            loader.load('./fonts/Roboto_Regular.json', resolve, undefined, reject);
        });
    }

    const textGeometry = new TextGeometry(textContent, {
        font: font,
        size: size,
        height: height,
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.01,
        bevelOffset: 0,
        bevelSegments: 5
    });
    textGeometry.center(); // Center the text geometry

    const textMaterial = new THREE.MeshBasicMaterial({ color: 0x73ed2d }); // White color 0xffffff
    // const textMaterial = new THREE.MeshStandardMaterial({ color: 0x73ed2d });
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);

    textMesh.position.copy(position);
    textMesh.rotation.y = rotationY;
    textMesh.castShadow = true;
    textMesh.receiveShadow = true;

    scene.add(textMesh);
    return textMesh;
}
