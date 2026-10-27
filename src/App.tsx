import { useMemo, useState } from 'react'

const tools = [
  { id: 'image', icon: '✳', title: 'Image Studio', subtitle: 'Generate visual concepts', tag: 'IMAGE' },
  { id: 'restore', icon: '◈', title: 'Restore', subtitle: 'Repair old or damaged images', tag: 'RESTORE' },
  { id: 'upscale', icon: '↗', title: 'Upscale', subtitle: 'Increase resolution and detail', tag: 'UPSCALE' },
  { id: 'video', icon: '▶', title: 'Video Studio', subtitle: 'Plan clips and motion workflows', tag: 'VIDEO' },
  { id: 'face', icon: '◎', title: 'Face Tools', subtitle: 'Authorized face restoration workflows', tag: 'FACE' },
  { id: 'three', icon: '◇', title: '3D Lab', subtitle: 'Prepare assets for 3D workflows', tag: '3D' },
] as const

type ToolId = typeof tools[number]['id']

export default function App() {
  const [active, setActive] = useState<ToolId>('image')
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<'local' | 'cloud'>('local')
  const [fileName, setFileName] = useState('')
  const [notice, setNotice] = useState('')
  const selected = useMemo(() => tools.find((tool) => tool.id === active)!, [active])

  function handleFile(file?: File) {
    if (!file) return
    setFileName(file.name)
    setNotice('File dipilih untuk pratinjau lokal. Upload ke server belum diaktifkan.')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="AI Generator Studio home">
          <span className="brand-mark">A<span>✳</span></span>
          <span><strong>GENERATOR</strong><small>AI STUDIO / 01</small></span>
        </a>
        <div className="side-label">WORKSPACE</div>
        <nav className="tool-nav" aria-label="Studio tools">
          {tools.map((tool) => (
            <button key={tool.id} className={active === tool.id ? 'nav-item active' : 'nav-item'} onClick={() => { setActive(tool.id); setNotice('') }}>
              <span className="nav-icon">{tool.icon}</span><span>{tool.title}</span>
              {tool.id === 'image' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="status-card"><span className="status-led" /><div><strong>Studio shell ready</strong><small>Inference not connected</small></div></div>
          <p>HYBRID WORKSPACE<br />BUILD 0.1.0 · PREVIEW</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">WORKSPACE <span>/</span> {selected.tag}</div>
          <div className="top-actions"><span className="env-pill"><i /> DEV PREVIEW</span><span className="avatar">AG</span></div>
        </header>
        <section className="content">
          <div className="hero">
            <div><div className="eyebrow"><span /> CREATIVE COMPUTE ENVIRONMENT</div><h1>Make something<br /><em>extraordinary.</em></h1><p>One workspace for image, motion, restoration and 3D experiments.</p></div>
            <div className="hero-art" aria-hidden="true"><div className="orb orb-one" /><div className="orb orb-two" /><div className="orb-core">✳</div><div className="art-ring ring-one" /><div className="art-ring ring-two" /><span className="art-label">GEN / 001</span></div>
          </div>

          <div className="section-head"><div><div className="eyebrow muted">YOUR TOOLKIT</div><h2>Choose a creative workflow</h2></div><span className="count">06 MODULES</span></div>
          <div className="tool-grid">
            {tools.map((tool, index) => (
              <button key={tool.id} className={active === tool.id ? 'tool-card selected' : 'tool-card'} onClick={() => { setActive(tool.id); setNotice('') }}>
                <span className="card-index">0{index + 1}</span><span className="card-icon">{tool.icon}</span><strong>{tool.title}</strong><small>{tool.subtitle}</small><span className="card-arrow">↗</span>
              </button>
            ))}
          </div>

          <section className="studio-panel">
            <div className="panel-heading"><div><div className="eyebrow muted">ACTIVE WORKSPACE / {selected.tag}</div><h2>{selected.title}</h2></div><div className="mode-switch" aria-label="Execution mode"><button className={mode === 'local' ? 'chosen' : ''} onClick={() => setMode('local')}>LOCAL</button><button className={mode === 'cloud' ? 'chosen' : ''} onClick={() => setMode('cloud')}>CLOUD</button></div></div>
            <div className="workspace-grid">
              <div className="input-column">
                <label htmlFor="prompt">PROMPT / INSTRUCTIONS</label>
                <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={active === 'image' ? 'Describe the image you want to create…' : 'Describe the result or processing instructions…'} rows={4} />
                <label className="upload-label" htmlFor="media-file"><span>＋</span><span><strong>{fileName || 'Add source media'}</strong><small>{fileName ? 'Selected locally — not uploaded' : 'Image or video · choose a local file'}</small></span><b>↗</b></label>
                <input id="media-file" className="file-input" type="file" accept="image/*,video/*" onChange={(event) => handleFile(event.target.files?.[0])} />
                <button className="primary-action" onClick={() => setNotice('Belum dijalankan: adapter inferensi belum terhubung. UI ini tidak membuat atau mengubah media AI.')}>Prepare workflow <span>↗</span></button>
                {notice && <p className="notice" role="status">{notice}</p>}
              </div>
              <div className="preview-column"><div className="preview-top"><span>OUTPUT PREVIEW</span><span className="preview-state">NO JOB</span></div><div className="preview-canvas"><div className="preview-sun" /><div className="preview-horizon" /><div className="preview-copy"><span>STUDIO / PREVIEW</span><strong>{selected.title}</strong><small>{mode === 'local' ? 'LOCAL WORKER · NOT CONNECTED' : 'CLOUD PROVIDER · NOT CONNECTED'}</small></div><div className="preview-cross">＋</div></div><div className="preview-foot"><span>Waiting for an inference adapter</span><span>— / —</span></div></div>
            </div>
          </section>
          <footer><span>AI GENERATOR STUDIO © 2026</span><span>DESIGNED FOR RESPONSIBLE CREATION <b>✳</b></span></footer>
        </section>
      </main>
    </div>
  )
}
