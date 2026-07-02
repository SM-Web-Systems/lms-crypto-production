import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const MAX_DPR = 2;

export type DottedSurfaceProps = Omit<React.ComponentProps<'div'>, 'ref'> & {
  /**
   * `theme` — particle tint follows `next-themes` (`dark` → light dots).
   * `onDark` / `onLight` — fixed palettes for backgrounds (e.g. hero on brand gradient).
   */
  particlePalette?: 'theme' | 'onDark' | 'onLight';
};

function particleRgb(palette: 'darkBg' | 'lightBg'): [number, number, number] {
  return palette === 'darkBg' ? [200, 210, 218] : [28, 42, 48];
}

export function DottedSurface({
  className,
  particlePalette = 'theme',
  ...props
}: DottedSurfaceProps) {
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const paletteKey: 'darkBg' | 'lightBg' =
    particlePalette === 'onDark'
      ? 'darkBg'
      : particlePalette === 'onLight'
        ? 'lightBg'
        : resolvedTheme === 'dark'
          ? 'darkBg'
          : 'lightBg';

  const [pr, pg, pb] = particleRgb(paletteKey);
  const fogColor = paletteKey === 'darkBg' ? 0x1b3a4b : 0xffffff;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const SEPARATION = 150;
    const AMOUNTX = 40;
    const AMOUNTY = 60;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(fogColor, 2000, 10000);

    const camera = new THREE.PerspectiveCamera(60, 1, 1, 10000);
    camera.position.set(0, 355, 1220);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(new THREE.Color(fogColor), 0);
    const setRendererSize = (width: number, height: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height);
    };

    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];

    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        const x = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
        const y = 0;
        const z = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;
        positions.push(x, y, z);
        colors.push(pr, pg, pb);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 8,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    let animationId = 0;
    let count = 0;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width < 1 || height < 1) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      setRendererSize(width, height);
    };

    resize();
    container.appendChild(renderer.domElement);

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const positionAttribute = geometry.attributes.position;
      const pos = positionAttribute.array as Float32Array;

      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          const index = i * 3;
          pos[index + 1] =
            Math.sin((ix + count) * 0.3) * 50 + Math.sin((iy + count) * 0.5) * 50;
          i++;
        }
      }
      positionAttribute.needsUpdate = true;

      renderer.render(scene, camera);
      count += 0.1;
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      ro.disconnect();

      scene.traverse((object) => {
        if (object instanceof THREE.Points) {
          object.geometry.dispose();
          const mat = object.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [fogColor, pr, pg, pb]);

  return (
    <div
      ref={containerRef}
      className={cn('pointer-events-none absolute inset-0 z-0', className)}
      {...props}
    />
  );
}
