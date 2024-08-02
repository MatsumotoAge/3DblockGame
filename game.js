import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass';

let scene, camera, renderer, controls, raycaster, mouse, composer;
const GRID_SIZE = 50;
const WORLD_SIZE = 6;
let blocks = {};
let textures = {};
let currentBlock = 0;
let textureCount = 0;
let isPerspective = true;
let skyColor = new THREE.Color(0x87CEEB);
let sunLight, hemiLight;
let indirectLightIntensity = 4.0;
let sunIntensity = 6.0;
let normalStrength = 2.5;
let focusDistance = 200;
let fStop = 6.0;

let fov = 75;

let isRightMouseDown = false;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();


let moveUp = false;
let moveDown = false;
let moveUpAlt = false;
let moveDownAlt = false;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.03, 12000);
    camera.position.set(WORLD_SIZE * GRID_SIZE / 2, WORLD_SIZE * GRID_SIZE / 2, WORLD_SIZE * GRID_SIZE);
    camera.lookAt(WORLD_SIZE * GRID_SIZE / 2, WORLD_SIZE * GRID_SIZE / 2, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    let currentBlock = undefined;

    camera.position.set(WORLD_SIZE * GRID_SIZE / 2, WORLD_SIZE * GRID_SIZE / 2, WORLD_SIZE * GRID_SIZE);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    createGroundGrid();
    createLighting();
    createUI();

    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = 16;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.1;
    composer.addPass(ssaoPass);

    const bokehPass = new BokehPass(scene, camera, {
        focus: focusDistance,
        aperture: 0.00005 * fStop,
        maxblur: 0.01,
        width: window.innerWidth,
        height: window.innerHeight
    });
    composer.addPass(bokehPass);

    updateLighting();

    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    document.addEventListener('mousedown', onMouseDown, false);
    document.addEventListener('mouseup', onMouseUp, false);
    document.addEventListener('mousemove', onMouseMove, false);
    document.addEventListener('click', onMouseClick, false);
}

function createGroundGrid() {
    const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE * GRID_SIZE, WORLD_SIZE * GRID_SIZE);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'Ground';
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(WORLD_SIZE * GRID_SIZE, WORLD_SIZE, 0x888888, 0x888888);
    gridHelper.position.y = 0.1;
    scene.add(gridHelper);
}

function createLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffffff, sunIntensity);
    sunLight.position.set(WORLD_SIZE * GRID_SIZE / 2, WORLD_SIZE * GRID_SIZE, WORLD_SIZE * GRID_SIZE / 2);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = WORLD_SIZE * GRID_SIZE * 20; // 距離を20倍に増加
    sunLight.shadow.camera.left = -WORLD_SIZE * GRID_SIZE * 10;
    sunLight.shadow.camera.right = WORLD_SIZE * GRID_SIZE * 10;
    sunLight.shadow.camera.top = WORLD_SIZE * GRID_SIZE * 10;
    sunLight.shadow.camera.bottom = -WORLD_SIZE * GRID_SIZE * 10;
    scene.add(sunLight);

    hemiLight = new THREE.HemisphereLight(skyColor, 0x404040, indirectLightIntensity);
    scene.add(hemiLight);

    scene.background = skyColor;
}
function updateLighting() {
    hemiLight.color.copy(skyColor);
    hemiLight.intensity = indirectLightIntensity;
    scene.background = skyColor;
    sunLight.intensity = sunIntensity;
    
   
}
function updateDOF() {
    composer.passes.forEach(pass => {
        if (pass instanceof BokehPass) {
            pass.uniforms["focus"].value = focusDistance;
            // F値が小さいほど被写界深度が浅くなるように調整
            pass.uniforms["aperture"].value = 0.00005 / fStop;
        }
    });
}

function resizeTexture(texture, width = 256, height = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;  // これにより、リサイズ時のスムージングが無効になります
    ctx.drawImage(texture.image, 0, 0, width, height);
    
    const resizedTexture = new THREE.Texture(canvas);
    resizedTexture.magFilter = THREE.NearestFilter;  // ピクセルを鮮明に表示
    resizedTexture.minFilter = THREE.NearestFilter;  // ピクセルを鮮明に表示
    resizedTexture.needsUpdate = true;
    return resizedTexture;
}


function loadTexture(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const texture = new THREE.Texture(this);
                texture.needsUpdate = true;
                const resizedTexture = resizeTexture(texture);
                const normalMap = generateNormalMap(resizedTexture);
                normalMap.magFilter = THREE.NearestFilter;
                normalMap.minFilter = THREE.NearestFilter;
                normalMap.needsUpdate = true;
                textures[file.name] = {
                    map: resizedTexture,
                    normalMap: normalMap,
                    data: resizedTexture.image.toDataURL() // リサイズ後のデータを保存
                };
                createTextureButton(file.name, textures[file.name].data);
                textureCount++;
                updateDropZoneState();
                resolve();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
function generateNormalMap(texture) {
    const width = texture.image.width;
    const height = texture.image.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(texture.image, 0, 0);
    const imgData = ctx.getImageData(0, 0, width, height);
    const normalMapData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const left = imgData.data[i - 4] || imgData.data[i];
            const right = imgData.data[i + 4] || imgData.data[i];
            const up = imgData.data[i - width * 4] || imgData.data[i];
            const down = imgData.data[i + width * 4] || imgData.data[i];

            normalMapData.data[i] = 128 + (right - left);
            normalMapData.data[i + 1] = 128 + (down - up);
            normalMapData.data[i + 2] = 255;
            normalMapData.data[i + 3] = 255;
        }
    }

    ctx.putImageData(normalMapData, 0, 0);
    const normalMap = new THREE.Texture(canvas);
    normalMap.needsUpdate = true;
    return normalMap;
}

function createTextureButton(name, url) {
    const texturesDiv = document.getElementById('textures');
    const button = document.createElement('button');
    button.className = 'texture-button';
    button.style.backgroundImage = `url(${url})`;
    button.style.backgroundSize = 'cover';
    button.title = name;
    button.addEventListener('click', () => {
        currentBlock = name;  // テクスチャ名を設定
        document.querySelectorAll('.texture-button').forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
    });
    texturesDiv.appendChild(button);
}

function createUI() {
    document.getElementById('eraser').addEventListener('click', () => {
        currentBlock = undefined;
        document.querySelectorAll('.texture-button').forEach(btn => btn.classList.remove('selected'));
    });


    document.getElementById('exportPNG').addEventListener('click', exportToPNG);

    document.getElementById('skyColor').addEventListener('input', (e) => {
        skyColor.set(e.target.value);
        updateLighting();
    });

    document.getElementById('indirectLight').addEventListener('input', (e) => {
        indirectLightIntensity = parseFloat(e.target.value);
        updateLighting();
    });

    document.getElementById('sunIntensity').addEventListener('input', (e) => {
        sunIntensity = parseFloat(e.target.value);
        updateLighting();
    });


    document.getElementById('focusDistance').addEventListener('input', (e) => {
        focusDistance = parseFloat(e.target.value);
        updateDOF();
    });

    document.getElementById('fStop').addEventListener('input', (e) => {
        fStop = parseFloat(e.target.value);
        updateDOF();
    });

    document.getElementById('fov').addEventListener('input', (e) => {
        fov = parseFloat(e.target.value);
    });


    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        for (let file of files) {
            if (file.type.startsWith('image/')) {
                loadTexture(file).catch(err => {
                    console.warn(`Failed to load texture: ${file.name}`, err);
                });
            }
        }
    });

    // デフォルト値の設定
    document.getElementById('indirectLight').value = indirectLightIntensity;
    document.getElementById('sunIntensity').value = sunIntensity;
    document.getElementById('focusDistance').value = focusDistance;
    document.getElementById('fStop').value = fStop;
    document.getElementById('saveGame').addEventListener('click', saveGame);

    
    
    document.getElementById('loadGameButton').addEventListener('click', () => {
        document.getElementById('loadGame').click();
    });

    document.getElementById('loadGame').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadGame(e.target.files[0]);
        }
    });
}

function updateDropZoneState() {
    const dropZone = document.getElementById('drop-zone');
    if (textureCount === 0) {
        dropZone.classList.add('empty');
    } else {
        dropZone.classList.remove('empty');
    }
}

function createBlockMesh() {
    const geometry = new THREE.BoxGeometry(GRID_SIZE, GRID_SIZE, GRID_SIZE);
    const material = new THREE.MeshStandardMaterial({ 
        map: textures[currentBlock].map, 
        normalMap: textures[currentBlock].normalMap,
        normalScale: new THREE.Vector2(normalStrength, normalStrength),
        metalness: 0.1, 
        roughness: 0.7 
    });
    return new THREE.Mesh(geometry, material);
}

function placeBlock(x, y, z, textureName) {
    if (textureName === undefined) {
        removeBlock(x, y, z);
        return;
    }

    const key = `${x},${y},${z}`;
    if (blocks[key]) return;

    const texture = textures[textureName];
    if (!texture) return;

    const geometry = new THREE.BoxGeometry(GRID_SIZE, GRID_SIZE, GRID_SIZE);
    const material = new THREE.MeshStandardMaterial({ 
        map: texture.map, 
        normalMap: texture.normalMap,
        normalScale: new THREE.Vector2(normalStrength, normalStrength),
        metalness: 0.1, 
        roughness: 0.7 
    });
    material.map.magFilter = THREE.NearestFilter;
    material.map.minFilter = THREE.NearestFilter;
    material.normalMap.magFilter = THREE.NearestFilter;
    material.normalMap.minFilter = THREE.NearestFilter;
    material.needsUpdate = true;  // この行を追加
    const block = new THREE.Mesh(geometry, material);
    block.position.set(x * GRID_SIZE + GRID_SIZE / 2, y * GRID_SIZE + GRID_SIZE / 2, z * GRID_SIZE + GRID_SIZE / 2);
    block.castShadow = true;
    block.receiveShadow = true;
    block.userData.textureName = textureName;
    scene.add(block);
    blocks[key] = block;

    // 強制的にシーンをアップデート
    renderer.render(scene, camera);
}

function removeBlock(x, y, z) {
    const key = `${x},${y},${z}`;
    if (blocks[key]) {
        scene.remove(blocks[key]);
        delete blocks[key];
    }
}

function onMouseDown(event) {
    if (event.button === 2) {
        isRightMouseDown = true;
        
    }
}

function onMouseUp(event) {
    if (event.button === 2) {
        isRightMouseDown = false;
        
    }
}
let cameraYaw = 0;
let cameraPitch = 0;

function onMouseMove(event) {
    if (isRightMouseDown) {
        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        const rotationSpeed = 0.002;
        cameraYaw -= movementX * rotationSpeed;
        cameraPitch -= movementY * rotationSpeed;

        cameraPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, cameraPitch));

        camera.quaternion.setFromEuler(new THREE.Euler(cameraPitch, cameraYaw, 0, 'YXZ'));
    }
}

function onMouseClick(event) {
    if (event.target.closest('#ui')) return;

    event.preventDefault();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects([...Object.values(blocks), scene.getObjectByName('Ground')]);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        let position = new THREE.Vector3().copy(intersect.point);

        if (intersect.face) {
            if (event.button === 2 || currentBlock === undefined) {
                position.sub(intersect.face.normal.multiplyScalar(GRID_SIZE / 2));
            } else {
                position.add(intersect.face.normal.multiplyScalar(GRID_SIZE / 2));
            }
        }

        const x = Math.floor(position.x / GRID_SIZE);
        const y = Math.floor(position.y / GRID_SIZE);
        const z = Math.floor(position.z / GRID_SIZE);

        if (event.button === 0 && currentBlock !== undefined) {
            placeBlock(x, y, z, currentBlock);
        } else if (event.button === 2 || currentBlock === undefined) {
            removeBlock(x, y, z);
        }
    }
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': moveUp = true; break;
        case 'ShiftLeft': case 'ShiftRight': moveDown = true; break;
        case 'KeyE': moveUpAlt = true; break;
        case 'KeyQ': moveDownAlt = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
        case 'Space': moveUp = false; break;
        case 'ShiftLeft': case 'ShiftRight': moveDown = false; break;
        case 'KeyE': moveUpAlt = false; break;
        case 'KeyQ': moveDownAlt = false; break;
    }
}

function updateCamera(delta) {
    const speed = 200.0; // 移動速度を調整できます
    const verticalSpeed = 100.0; // 上下移動の速度を調整できます

    // 移動方向を計算
    const moveDirection = new THREE.Vector3(0, 0, 0);
    if (moveForward) moveDirection.z -= 1;
    if (moveBackward) moveDirection.z += 1;
    if (moveLeft) moveDirection.x -= 1;
    if (moveRight) moveDirection.x += 1;
    moveDirection.normalize();

    // 上下移動を追加
    if (moveUp || moveUpAlt) moveDirection.y += 1;
    if (moveDown || moveDownAlt) moveDirection.y -= 1;

    // カメラの向きに基づいて移動方向を調整
    const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    cameraDirection.y = 0; // Y軸の動きを無視
    cameraDirection.normalize();
    
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    const movement = new THREE.Vector3()
        .addScaledVector(cameraRight, moveDirection.x * speed * delta)
        .addScaledVector(cameraDirection, -moveDirection.z * speed * delta)
        .addScaledVector(new THREE.Vector3(0, 1, 0), moveDirection.y * verticalSpeed * delta);

    camera.position.add(movement);

    // FOVの更新
    if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
    }
}


function exportToPNG() {
    composer.render();
    const dataURL = renderer.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataURL;
    link.download = "3d_block_game_screenshot.png";
    link.click();
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    updateCamera(delta);
    updateLighting();  // この行を追加

    composer.render();

    prevTime = time;
}
init();
animate();




function saveGame() {
    const gameData = {
        blocks: Object.keys(blocks).map(key => {
            const [x, y, z] = key.split(',').map(Number);
            return { x, y, z, textureName: blocks[key].userData.textureName };
        }),
        camera: {
            position: camera.position.toArray(),
            rotation: camera.rotation.toArray()
        },
        textures: Object.fromEntries(
            Object.entries(textures).map(([name, texture]) => [name, texture.data])
        ),
        parameters: {
            indirectLightIntensity,
            sunIntensity,
            normalStrength,
            focusDistance,
            fStop,
            skyColor: skyColor.getHexString()
        }
    };

    const blob = new Blob([JSON.stringify(gameData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game_save.json';
    a.click();
    URL.revokeObjectURL(url);
}

function loadGame(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const gameData = JSON.parse(e.target.result);
        
        // Clear existing textures and blocks
        textures = {};
        Object.values(blocks).forEach(block => scene.remove(block));
        blocks = {};

        if (gameData.parameters) {
            indirectLightIntensity = gameData.parameters.indirectLightIntensity;
            sunIntensity = gameData.parameters.sunIntensity;
            normalStrength = gameData.parameters.normalStrength;
            focusDistance = gameData.parameters.focusDistance;
            fStop = gameData.parameters.fStop;
            skyColor.setHex(parseInt(gameData.parameters.skyColor, 16));

            // UIの更新
            document.getElementById('indirectLight').value = indirectLightIntensity;
            document.getElementById('sunIntensity').value = sunIntensity;
            document.getElementById('focusDistance').value = focusDistance;
            document.getElementById('fStop').value = fStop;
            document.getElementById('skyColor').value = '#' + gameData.parameters.skyColor;

            updateLighting();
            updateDOF();
        }

        // Load textures
        const texturePromises = Object.entries(gameData.textures).map(([name, data]) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = function() {
                    const texture = new THREE.Texture(this);
                    texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                    texture.needsUpdate = true;
                    const resizedTexture = resizeTexture(texture);
                    const normalMap = generateNormalMap(resizedTexture);
                    normalMap.magFilter = THREE.NearestFilter;
                normalMap.minFilter = THREE.NearestFilter;
                    normalMap.needsUpdate = true;
                    textures[name] = {
                        map: resizedTexture,
                        normalMap: normalMap,
                        data: data
                    };
                    createTextureButton(name, data);
                    resolve();
                };
                img.src = data;
            });
        });

        Promise.all(texturePromises).then(() => {
            // Recreate blocks
            gameData.blocks.forEach(blockData => {
                placeBlock(blockData.x, blockData.y, blockData.z, blockData.textureName);
            });

            // Restore camera position and rotation
            camera.position.fromArray(gameData.camera.position);
            camera.rotation.fromArray(gameData.camera.rotation);
        });
    };
    reader.readAsText(file);
}
window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    if (isPerspective) {
        camera.aspect = aspect;
    } else {
        const frustumSize = WORLD_SIZE * GRID_SIZE * 2;
        camera.left = -frustumSize * aspect / 2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = -frustumSize / 2;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('contextmenu', (event) => event.preventDefault(), false);