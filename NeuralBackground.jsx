import React, { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

// --- GENEL AYARLAR ---
const PARTICLE_COUNT = 180; // Düğüm sayısı artırıldı (Daha kompleks ağ)
const NEIGHBORS_TO_CONNECT = 3; 
const FIELD_SCALE = 0.3; // Hareket alanı biraz daraltıldı, daha "dijital" titreşim
const GLOBAL_SPEED = 0.05;

let noise3D;
try { noise3D = createNoise3D(); } catch { noise3D = () => 0; }

const CyberNetwork = ({ isDark }) => {
  const linesRef = useRef();
  const pointsRef = useRef(); // Noktalar (Nodes) için referans
  const { viewport, mouse, scene } = useThree();

  // --- AKILLI TEMA KONFİGÜRASYONU ---
  const theme = useMemo(() => {
    if (isDark) {
      return {
        lineColor: new THREE.Color('#ff0033'), // Siber Kırmızı (Daha keskin)
        pointColor: new THREE.Color('#000000'), // Düğümler beyaz parlasın (Veri paketi gibi)
        bgColor: new THREE.Color('#000000'),    // Tam siyah değil, monitör siyahı
        fogColor: '#050505',
        fogDensity: 0.04,                      // Çok yoğun sis (Dark Web hissi)
        blending: THREE.AdditiveBlending,
        opacityLines: 0.5,
        opacityPoints: 0.9                     // Noktalar daha parlak
      };
    } else {
      return {
        lineColor: new THREE.Color('#8b0000'), 
        pointColor: new THREE.Color('#ffffff'), // Aydınlıkta noktalar koyu gri
        bgColor: new THREE.Color('#ffffff'),
        fogColor: '#ffffff',
        fogDensity: 0.02,
        blending: THREE.NormalBlending,
        opacityLines: 0.3,
        opacityPoints: 0.6
      };
    }
  }, [isDark]);

  useEffect(() => {
    scene.background = theme.bgColor;
    scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);
  }, [theme, scene]);

  // --- VERİ HAZIRLIĞI ---
  const particles = useMemo(() => {
    const position = new Float32Array(PARTICLE_COUNT * 3);
    const offset = new Float32Array(PARTICLE_COUNT);
    const initialPos = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT); // Her noktanın boyutu farklı olsun

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Siber Küre Formasyonu
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const r = Math.random() * 10 + 5; 

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      position[i3] = x; position[i3 + 1] = y; position[i3 + 2] = z;
      initialPos[i3] = x; initialPos[i3 + 1] = y; initialPos[i3 + 2] = z;

      offset[i] = Math.random() * 1000;
      sizes[i] = Math.random(); // 0 ile 1 arası rastgele boyut faktörü
    }
    return { position, offset, initialPos, sizes };
  }, []);

  // --- GEOMETRİ ---
  // 1. Çizgiler için
  const lineVertexCount = PARTICLE_COUNT * NEIGHBORS_TO_CONNECT * 2;
  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(lineVertexCount * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, [lineVertexCount]);

  // 2. Noktalar (Nodes) için - Aynı pozisyonları kullanacaklar
  const pointsGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(particles.position, 3)); // Referans kopyası
    return geometry;
  }, [particles.position]);

  useFrame((state) => {
    if (!linesRef.current || !pointsRef.current) return;

    const time = state.clock.getElapsedTime();
    const { width, height } = viewport;
    const { position, offset, initialPos, sizes } = particles;

    const mouseX = (mouse.x * width) / 2;
    const mouseY = (mouse.y * height) / 2;

    // --- HAREKET FİZİĞİ ---
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      let px = position[i3]; let py = position[i3 + 1]; let pz = position[i3 + 2];

      const t = (time + offset[i]) * GLOBAL_SPEED; 
      
      // Noise (Daha keskin, dijital hareket)
      // Frekansları biraz artırdık (0.04 -> 0.05)
      px += noise3D(px * FIELD_SCALE, py * FIELD_SCALE, t) * 0.05;
      py += noise3D(py * FIELD_SCALE, pz * FIELD_SCALE, t + 100) * 0.05;
      pz += noise3D(pz * FIELD_SCALE, px * FIELD_SCALE, t + 200) * 0.05;

      // Mouse Etkileşimi (Manyetik Alan)
      const dx = mouseX - px; const dy = mouseY - py;
      const distToMouse = Math.sqrt(dx*dx + dy*dy + pz*pz);
      
      if (distToMouse < 10) {
        const force = (10 - distToMouse) / 10;
        px -= dx * force * 0.03; py -= dy * force * 0.03;
      }

      // Merkeze Dönüş
      const distFromCenter = Math.sqrt(px*px + py*py + pz*pz);
      if (distFromCenter > 20) {
         px += (initialPos[i3] - px) * 0.015;
         py += (initialPos[i3 + 1] - py) * 0.015;
         pz += (initialPos[i3 + 2] - pz) * 0.015;
      }

      position[i3] = px; position[i3 + 1] = py; position[i3 + 2] = pz;
    }

    // --- NOKTALARI GÜNCELLE ---
    // BufferGeometry attribute'unu manuel güncellememiz lazım
    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // --- ÇİZGİLERİ GÜNCELLE ---
    const linePositions = linesRef.current.geometry.attributes.position.array;
    let lineIdx = 0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const px = position[i * 3]; const py = position[i * 3 + 1]; const pz = position[i * 3 + 2];
      
      let neighbors = [];
      for (let j = 0; j < PARTICLE_COUNT; j++) {
        if (i === j) continue;
        const nPx = position[j * 3]; const nPy = position[j * 3 + 1]; const nPz = position[j * 3 + 2];
        const distSq = (px - nPx) ** 2 + (py - nPy) ** 2 + (pz - nPz) ** 2;
        neighbors.push({ id: j, distSq });
      }
      neighbors.sort((a, b) => a.distSq - b.distSq);
      const closest = neighbors.slice(0, NEIGHBORS_TO_CONNECT);

      closest.forEach(neighbor => {
        const nIndex = neighbor.id * 3;
        linePositions[lineIdx++] = px; linePositions[lineIdx++] = py; linePositions[lineIdx++] = pz;
        linePositions[lineIdx++] = position[nIndex]; linePositions[lineIdx++] = position[nIndex + 1]; linePositions[lineIdx++] = position[nIndex + 2];
      });
    }
    linesRef.current.geometry.attributes.position.needsUpdate = true;
    
    // --- GÖRSEL EFEKTLER ---
    
    // 1. Nabız Efekti (Data Pulse)
    const pulse = (Math.sin(time * 1.5) + 1) / 2; // Daha hızlı nabız (Siber hissi)
    
    // Çizgiler
    linesRef.current.material.color = theme.lineColor;
    linesRef.current.material.opacity = isDark 
        ? 0.3 + (pulse * 0.2) // Karanlıkta nefes al
        : 0.3;
    linesRef.current.material.blending = theme.blending;

    // Noktalar (Düğümler)
    pointsRef.current.material.color = theme.pointColor;
    // Noktalar biraz daha belirgin olsun ve parlasın
    pointsRef.current.material.size = isDark ? 0.12 : 0.08; 
    pointsRef.current.material.opacity = theme.opacityPoints;

    // 2. Siber Kamera (Orbit + Hafif Titreşim)
    const camRadius = 28;
    const camSpeed = 0.08;
    state.camera.position.x = Math.sin(time * camSpeed) * camRadius;
    state.camera.position.z = Math.cos(time * camSpeed) * camRadius;
    // Y ekseninde "Scanning" hareketi (Yukarı aşağı tarama)
    state.camera.position.y = Math.sin(time * 0.2) * 8; 
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <>
      {/* 1. KATMAN: ÇİZGİLER (Ağ Bağlantıları) */}
      <lineSegments ref={linesRef} geometry={lineGeometry}>
        <lineBasicMaterial 
            transparent 
            depthWrite={false} 
        />
      </lineSegments>

      {/* 2. KATMAN: NOKTALAR (Veri Düğümleri/Sunucular) */}
      <points ref={pointsRef} geometry={pointsGeometry}>
        <pointsMaterial 
            transparent
            depthWrite={false}
            sizeAttenuation={true}
            blending={theme.blending}
        />
      </points>
    </>
  );
};

const NeuralBackground = ({ isDark = true }) => {
  const [ready, setReady] = useState(false);

  // Efekt Ayarları
  const effects = useMemo(() => isDark ? {
    bloomIntensity: 2.5,
    bloomThreshold: 0.1,
    noiseOpacity: 0.4, // Biraz daha fazla noise (Sinyal gürültüsü)
    vignetteDarkness: 0,
    chromaticOffset: [0.0006] // RGB Ayrışması (Glitch hissi)
  } : {
    bloomIntensity: 2.5,
    bloomThreshold: 0.1,
    noiseOpacity: 0.4,
    vignetteDarkness: 0,
    chromaticOffset: [0.0006] // Aydınlıkta çok hafif
  }, [isDark]);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      zIndex: 0,
      background: isDark ? '#000000' : '#ffffff',
      transition: 'background-color 1s ease',
      overflow: 'hidden', pointerEvents: 'none'
    }}>
      <Canvas
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false, depth: false }}
        dpr={[1, 2]} 
        camera={{ fov: 50, position: [0, 0, 30] }}
        onCreated={() => setReady(true)}
      >
        <Suspense fallback={null}>
          <CyberNetwork isDark={isDark} />

          <EffectComposer>
            {/* 1. BLOOM: Neon Parlaması */}
            <Bloom
              luminanceThreshold={effects.bloomThreshold}
              luminanceSmoothing={0.9}
              height={300}
              intensity={effects.bloomIntensity} 
            />
            
            {/* 2. NOISE: Dijital Kumlanma */}
            <Noise opacity={effects.noiseOpacity} />
            
            {/* 3. CHROMATIC ABERRATION: 3D Siber Gözlük Etkisi */}
            {/* Bu efekt görsele muazzam bir teknolojik hava katar */}
            <ChromaticAberration 
                offset={new THREE.Vector2(effects.chromaticOffset[0], effects.chromaticOffset[1])} 
            />

            {/* 4. VIGNETTE: Odaklama */}
            <Vignette eskil={false} offset={0.1} darkness={effects.vignetteDarkness} />
            
          </EffectComposer>
        </Suspense>
      </Canvas>
      
      <div style={{
         position: 'absolute', top:0, left:0, width:'100%', height:'100%',
         background: isDark ? '#000' : '#fff',
         opacity: ready ? 0 : 1,
         transition: 'opacity 1s ease-out',
      }}></div>
    </div>
  );
};

export default NeuralBackground;
