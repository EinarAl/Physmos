import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Toolbar } from './ui/Toolbar'
import { Sidebar } from './ui/Sidebar'
import { Simulation } from './scene/Simulation'
import { SceneIO } from './ui/SceneIO'
import { HelpModal } from './ui/HelpModal'
import { SceneHUD } from './ui/SceneHUD'

export default function App() {
  return (
    <div className="app">
      <Toolbar />
      <SceneIO />
      <HelpModal />
      <div className="body">
        <Sidebar />
        <div className="canvas-wrap">
          <Canvas gl={{ antialias: true }}>
            <PerspectiveCamera
              makeDefault
              position={[7, -7, 6]}
              fov={45}
              near={0.1}
              far={200}
              up={new THREE.Vector3(0, 0, 1)}
            />
            <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
            <Simulation />
          </Canvas>
          <SceneHUD />
        </div>
      </div>
    </div>
  )
}