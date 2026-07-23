"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ForgedArtifact } from "../lib/artifact";

const WORLD_END = 46;
const PLAYER_SIZE = 1.15;
const FLOOR_Y = -2.7;
const GAP_START = 8;
const GAP_END = 14;
const GAP_CENTER = (GAP_START + GAP_END) / 2;

type Platform = {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  width: number;
  height: number;
};

function box(
  scene: THREE.Scene,
  size: [number, number, number],
  color: number,
  position: [number, number, number],
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.08 }),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

export default function Game() {
  const mountRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const [distance, setDistance] = useState(0);
  const [won, setWon] = useState(false);
  const [prompt, setPrompt] = useState("a bridge with questionable engineering");
  const [artifact, setArtifact] = useState<ForgedArtifact>();
  const [forgeState, setForgeState] = useState<"idle" | "forging" | "failed">("idle");
  const [forgeError, setForgeError] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10182d);
    scene.fog = new THREE.Fog(0x10182d, 17, 42);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 80);
    camera.position.set(0, 3.8, 14);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0x9ebdff, 0x151521, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 3.4);
    sun.position.set(-5, 10, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -10;
    scene.add(sun);

    const leftGround = box(
      scene,
      [21, 1.2, 5],
      0x202c44,
      [-2.5, FLOOR_Y - 0.6, 0],
    );
    const rightGround = box(
      scene,
      [43, 1.2, 5],
      0x202c44,
      [35.5, FLOOR_Y - 0.6, 0],
    );
    leftGround.receiveShadow = true;
    rightGround.receiveShadow = true;

    const platformData: Array<[number, number, number]> = [
      [7, -0.8, 4],
      [14, 0.2, 3],
      [20, -1.1, 4],
      [28, 0.1, 4],
      [36, -0.7, 3],
      [42, 0.5, 3],
    ];
    const platforms: Platform[] = platformData.map(([x, y, width]) => ({
      mesh: box(scene, [width, 0.55, 3], 0x334766, [x, y, 0]),
      x,
      y,
      width,
      height: 0.55,
    }));

    let propulsion:
      | { x: number; width: number; force: number }
      | undefined;

    if (artifact) {
      const anchorX =
        artifact.spec.affordance.kind === "propel" ? GAP_START - 0.85 : GAP_CENTER;
      const artifactGroup = new THREE.Group();
      artifactGroup.position.set(anchorX, FLOOR_Y + 0.2, 0);
      artifactGroup.name = artifact.spec.name;
      for (const part of artifact.spec.parts) {
        let geometry: THREE.BufferGeometry;
        switch (part.primitive) {
          case "sphere":
            geometry = new THREE.SphereGeometry(0.5, 18, 12);
            break;
          case "cylinder":
            geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
            break;
          case "cone":
            geometry = new THREE.ConeGeometry(0.5, 1, 18);
            break;
          case "torus":
            geometry = new THREE.TorusGeometry(0.5, 0.16, 10, 24);
            break;
          default:
            geometry = new THREE.BoxGeometry(1, 1, 1);
        }
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: part.color,
            roughness: 0.58,
            metalness: 0.12,
          }),
        );
        mesh.position.set(...part.position);
        mesh.scale.set(...part.scale);
        mesh.rotation.set(...part.rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        artifactGroup.add(mesh);
      }
      scene.add(artifactGroup);

      if (
        artifact.spec.affordance.kind === "support" ||
        artifact.spec.affordance.kind === "connect"
      ) {
        platforms.push({
          mesh: artifactGroup.children[0] as THREE.Mesh,
          x: GAP_CENTER,
          y: FLOOR_Y + 0.15,
          width: artifact.spec.affordance.span,
          height: 0.4,
        });
      } else {
        propulsion = {
          x: anchorX,
          width: 1.8,
          force: artifact.spec.affordance.force,
        };
      }
    }

    const player = box(
      scene,
      [PLAYER_SIZE, PLAYER_SIZE, PLAYER_SIZE],
      0x78f0c3,
      [0, FLOOR_Y + PLAYER_SIZE / 2, 0],
    );
    const faceMaterial = new THREE.MeshBasicMaterial({ color: 0x07121c });
    const eyeGeometry = new THREE.BoxGeometry(0.14, 0.18, 0.06);
    for (const eyeX of [-0.23, 0.23]) {
      const eye = new THREE.Mesh(eyeGeometry, faceMaterial);
      eye.position.set(eyeX, 0.15, 0.59);
      player.add(eye);
    }

    const stars = new THREE.Group();
    const starGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const starMaterial = new THREE.MeshBasicMaterial({ color: 0x9ebdff });
    for (let index = 0; index < 90; index += 1) {
      const star = new THREE.Mesh(starGeometry, starMaterial);
      star.position.set(
        Math.random() * 70 - 10,
        Math.random() * 11 - 1,
        -4 - Math.random() * 8,
      );
      star.scale.setScalar(0.4 + Math.random() * 1.3);
      stars.add(star);
    }
    scene.add(stars);

    const goal = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.16, 12, 48),
      new THREE.MeshStandardMaterial({
        color: 0xffd36a,
        emissive: 0x8c5514,
        emissiveIntensity: 1.4,
      }),
    );
    goal.position.set(WORLD_END, -0.8, 0);
    scene.add(goal);

    const keys = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (["KeyA", "KeyD", "Space"].includes(event.code)) event.preventDefault();
      keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    let velocityX = 0;
    let velocityY = 0;
    let grounded = true;
    let jumpHeld = false;
    let cameraX = 0;
    let lastDistance = -1;
    let finished = false;

    const reset = () => {
      player.position.set(0, FLOOR_Y + PLAYER_SIZE / 2, 0);
      player.rotation.set(0, 0, 0);
      velocityX = 0;
      velocityY = 0;
      cameraX = 0;
      finished = false;
      setWon(false);
      setDistance(0);
    };
    resetRef.current = reset;

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      const aspect = width / height;
      const viewHeight = 10;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 1 / 30);

      const direction = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
      velocityX += direction * 22 * dt;
      velocityX *= Math.pow(direction ? 0.08 : 0.002, dt);
      velocityX = THREE.MathUtils.clamp(velocityX, -7.5, 7.5);

      const wantsJump = keys.has("Space");
      if (wantsJump && !jumpHeld && grounded && !finished) {
        velocityY = 10.5;
        grounded = false;
      }
      jumpHeld = wantsJump;
      velocityY -= 25 * dt;

      const previousY = player.position.y;
      player.position.x = Math.max(-2, player.position.x + velocityX * dt);
      player.position.y += velocityY * dt;

      const playerBottom = player.position.y - PLAYER_SIZE / 2;
      const previousBottom = previousY - PLAYER_SIZE / 2;
      const overGround =
        player.position.x + PLAYER_SIZE * 0.38 < GAP_START ||
        player.position.x - PLAYER_SIZE * 0.38 > GAP_END;
      let landingY = overGround ? FLOOR_Y : Number.NEGATIVE_INFINITY;
      for (const platform of platforms) {
        const top = platform.y + platform.height / 2;
        const withinX =
          player.position.x + PLAYER_SIZE * 0.38 > platform.x - platform.width / 2 &&
          player.position.x - PLAYER_SIZE * 0.38 < platform.x + platform.width / 2;
        if (
          withinX &&
          velocityY <= 0 &&
          previousBottom >= top - 0.08 &&
          playerBottom <= top
        ) {
          landingY = Math.max(landingY, top);
        }
      }

      if (playerBottom <= landingY && velocityY <= 0) {
        player.position.y = landingY + PLAYER_SIZE / 2;
        velocityY = 0;
        grounded = true;
      } else {
        grounded = false;
      }

      if (
        propulsion &&
        Math.abs(player.position.x - propulsion.x) < propulsion.width / 2 &&
        player.position.y < FLOOR_Y + 1.5 &&
        velocityY <= 0
      ) {
        velocityY = propulsion.force;
        velocityX = Math.max(velocityX, 7.2);
        grounded = false;
      }

      if (player.position.y < -9) reset();

      player.rotation.z -= velocityX * dt * 0.55;
      goal.rotation.y += dt * 1.8;
      goal.rotation.z += dt * 0.45;

      const targetCameraX = Math.max(0, player.position.x);
      cameraX = THREE.MathUtils.damp(cameraX, targetCameraX, 5, dt);
      camera.position.x = cameraX;
      camera.lookAt(cameraX, 0, 0);
      stars.position.x = cameraX * 0.22;

      const roundedDistance = Math.min(100, Math.max(0, Math.round((player.position.x / WORLD_END) * 100)));
      if (roundedDistance !== lastDistance) {
        lastDistance = roundedDistance;
        setDistance(roundedDistance);
      }
      if (!finished && player.position.x >= WORLD_END - 0.75) {
        finished = true;
        velocityX = 0;
        setWon(true);
        void fetch("/api/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            progress: 100,
            completed: true,
            artifactId: artifact?.id,
          }),
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [artifact]);

  async function forge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = prompt.trim();
    if (request.length < 3 || forgeState === "forging") return;
    setForgeState("forging");
    setForgeError("");
    try {
      const response = await fetch("/api/forge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: request }),
      });
      const payload = (await response.json()) as {
        artifact?: ForgedArtifact;
        error?: string;
      };
      if (!response.ok || !payload.artifact) {
        throw new Error(payload.error ?? "The forge returned no artifact.");
      }
      setArtifact(payload.artifact);
      setForgeState("idle");
    } catch (error) {
      setForgeError(error instanceof Error ? error.message : "The forge failed.");
      setForgeState("failed");
    }
  }

  return (
    <main className="game">
      <div ref={mountRef} aria-label="Three-dimensional side-scrolling game" />
      <div className="hud">
        <div className="brand">Cube Run</div>
        <div className="status">
          Progress
          <strong>{distance}%</strong>
        </div>
        <div className="controls">
          <kbd>A</kbd>
          <kbd>D</kbd>
          <span>move</span>
          <kbd>Space</kbd>
          <span>jump</span>
        </div>
      </div>
      <form className="forge" onSubmit={forge}>
        <div className="forge-heading">
          <span>Pi artifact forge</span>
          <small>1 tool · 0 filesystem access</small>
        </div>
        <label htmlFor="artifact-prompt">What gets you across?</label>
        <div className="forge-input">
          <input
            id="artifact-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={300}
            disabled={forgeState === "forging"}
          />
          <button disabled={forgeState === "forging"}>
            {forgeState === "forging" ? "Imagining…" : "Forge"}
          </button>
        </div>
        {artifact && (
          <div className="artifact-card">
            <strong>{artifact.spec.name}</strong>
            <span>{artifact.spec.description}</span>
            <code>{artifact.spec.affordance.kind}</code>
          </div>
        )}
        {forgeError && <p className="forge-error">{forgeError}</p>}
      </form>
      {won && (
        <div className="win" role="dialog" aria-modal="true">
          <h1>Clear!</h1>
          <p>The little cube made it through.</p>
          <button onClick={() => resetRef.current()}>Run again</button>
        </div>
      )}
    </main>
  );
}
