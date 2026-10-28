import { useEffect, useMemo, useState } from 'react'

const tools = [
  { id: 'image', icon: '✳', title: 'Image Studio', subtitle: 'Generate visual concepts', tag: 'IMAGE' },
  { id: 'restore', icon: '◈', title: 'Restore', subtitle: 'Repair old or damaged images', tag: 'RESTORE' },
  { id: 'upscale', icon: '↗', title: 'Upscale', subtitle: 'Increase resolution and detail', tag: 'UPSCALE' },
  { id: 'video', icon: '▶', title: 'Video Studio', subtitle: 'Plan clips and motion workflows', tag: 'VIDEO' },
  { id: 'face', icon: '◎', title: 'Face Tools', subtitle: 'Authorized face restoration workflows', tag: 'FACE' },
  { id: 'three', icon: '◇', title: '3D Lab', subtitle: 'Prepare assets for 3D workflows', tag: '3D' },
] as const

type ToolId = typeof tools[number]['id']
type JobStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed'
type ApiHealth = { ok?: boolean; inference?: string }
type JobPayload = { job?: { id: string; status: Exclude<JobStatus, 'idle'>; outputs?: Array<{ type?: string }>; error?: string }; error?: { message?: string } }

export default function App() {
  const [active, setActive] = useState<ToolId>('image')
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<'local' | 'cloud'>('local')
  const [fileName, setFileName] = useState('')
  const [notice, setNotice] = useState('')
  const [jobId, setJobId] = useState('')
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle')
  const [outputUrl, setOutputUrl] = useState('')
  const [outputKind, setOutputKind] = useState<'image' | 'video' | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [apiHealth, setApiHealth] = useState<'checking' | 'ready' | 'unavailable'>('checking')
  const [inference, setInference] = useState('not checked')
  const selected = useMemo(() => tools.find((tool) => tool.id === active)!, [active])

  useEffect(() => {
    let activeRequest = true
    fetch('/healthz')
      .then(async (response) => {
        if (!response.ok) throw new Error('API health check failed')
        return await response.json() as ApiHealth
      })
      .then((health) => {
        if (!activeRequest) return
        setApiHealth('ready')
        setInference(health.inference || 'unknown')
      })
      .catch(() => {
        if (!activeRequest) return
        setApiHealth('unavailable')
        setInference('API unavailable')
      })
    return () => { activeRequest = false }
  }, [])

  useEffect(() => {
    if (!jobId) return
    let activeRequest = true
    const poll = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' })
        const payload = await response.json() as JobPayload
        if (!response.ok || !payload.job) throw new Error(payload.error?.message || 'Gagal membaca status pekerjaan')
        if (!activeRequest) return
        const job = payload.job
        setJobStatus(job.status)
        if (job.status === 'succeeded') {
          const firstOutput = job.outputs?.[0]
          if (firstOutput && (firstOutput.type === 'image' || firstOutput.type === 'video')) {
            setOutputKind(firstOutput.type)
            setOutputUrl(`/api/jobs/${jobId}/outputs/0`)
            setNotice('Pekerjaan selesai. Hasil dimuat dari API lokal.')
          } else {
            setNotice('Pekerjaan selesai, tetapi adapter tidak mengembalikan media yang dapat dipratinjau.')
          }
        } else if (job.status === 'failed') {
          setNotice(job.error || 'Pekerjaan gagal. Periksa log ComfyUI dan konfigurasi workflow.')
        }
      } catch (error) {
        if (activeRequest) setNotice(error instanceof Error ? error.message : 'Gagal membaca status pekerjaan')
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 2000)
    return () => {
      activeRequest = false
      window.clearInterval(timer)
    }
  }, [jobId])

  function handleFile(file?: File) {
    if (!file) return
    setFileName(file.name)
    setNotice('Berkas hanya dipilih di browser; upload dan pemrosesan berkas sumber belum diimplementasikan.')
  }

  async function handleGenerate() {
    setNotice('')
    setOutputUrl('')
    setOutputKind('')
    if (active !== 'image') {
      setNotice(`${selected.title} belum memiliki adapter inferensi khusus. Saat ini hanya Image Studio yang dapat mengirim prompt ke workflow ComfyUI.`)
      return
    }
    if (mode !== 'local') {
      setNotice('Provider cloud belum dikonfigurasi. Pilih LOCAL untuk memakai adapter ComfyUI yang sudah disiapkan.')
      return
    }
    if (fileName) {
      setNotice('Hapus pilihan berkas sumber terlebih dahulu. Upload sumber belum didukung; saat ini hanya prompt teks yang dikirim.')
      return
    }
    if (!prompt.trim()) {
      setNotice('Masukkan prompt terlebih dahulu.')
      return
    }
    setSubmitting(true)
    setJobId('')
    setJobStatus('idle')
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workflow: 'image', prompt, mode: 'local' }),
      })
      const payload = await response.json() as JobPayload
      if (!response.ok || !payload.job) throw new Error(payload.error?.message || `Permintaan gagal (HTTP ${response.status})`)
      setJobId(payload.job.id)
      setJobStatus(payload.job.status)
      setNotice('Prompt diterima API. Menunggu status dari ComfyUI; ini belum berarti gambar selesai dibuat.')
    } catch (error) {
      setJobStatus('failed')
      setNotice(error instanceof Error ? error.message : 'Tidak dapat mengirim pekerjaan ke API.')
    } finally {
      setSubmitting(false)
    }
  }

  const statusLabel = jobStatus === 'idle' ? 'NO JOB' : jobStatus.toUpperCase()

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
          <div className="status-card"><span className={apiHealth === 'ready' ? 'status-led ready' : 'status-led'} /><div><strong>{apiHealth === 'ready' ? 'API reachable' : apiHealth === 'checking' ? 'Checking API…' : 'API unavailable'}</strong><small>{inference}</small></div></div>
          <p>HYBRID WORKSPACE<br />BUILD 0.1.0 · PREVIEW</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">WORKSPACE <span>/</span> {selected.tag}</div>
          <div className="top-actions"><span className="env-pill"><i /> {apiHealth === 'ready' ? 'API REACHABLE' : apiHealth === 'checking' ? 'CHECKING API' : 'API OFFLINE'}</span><span className="avatar">AG</span></div>
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
                <button className="primary-action" onClick={() => void handleGenerate()} disabled={submitting || apiHealth === 'unavailable'}>{submitting ? 'Submitting…' : active === 'image' ? 'Generate image' : 'Prepare workflow'} <span>↗</span></button>
                {notice && <p className="notice" role="status">{notice}</p>}
              </div>
              <div className="preview-column"><div className="preview-top"><span>OUTPUT PREVIEW</span><span className={jobStatus === 'failed' ? 'preview-state failed' : 'preview-state'}>{statusLabel}</span></div><div className={outputUrl ? 'preview-canvas has-output' : 'preview-canvas'}>{outputUrl && outputKind === 'image' ? <img className="output-media" src={outputUrl} alt="Generated output" /> : outputUrl && outputKind === 'video' ? <video className="output-media" src={outputUrl} controls /> : <><div className="preview-sun" /><div className="preview-horizon" /><div className="preview-copy"><span>{jobId ? `JOB / ${jobId.slice(0, 8)}` : 'STUDIO / PREVIEW'}</span><strong>{selected.title}</strong><small>{jobStatus === 'queued' ? 'QUEUED · WAITING FOR COMFYUI' : jobStatus === 'running' ? 'COMFYUI IS PROCESSING' : mode === 'local' ? inference.toUpperCase() : 'CLOUD PROVIDER · NOT CONFIGURED'}</small></div><div className="preview-cross">＋</div></>}</div><div className="preview-foot"><span>{jobId ? `Job ${jobId.slice(0, 8)} · ${jobStatus}` : 'Waiting for a submitted job'}</span><span>{outputUrl ? 'OUTPUT READY' : '— / —'}</span></div></div>
            </div>
          </section>
          <footer><span>AI GENERATOR STUDIO © 2026</span><span>DESIGNED FOR RESPONSIBLE CREATION <b>✳</b></span></footer>
        </section>
      </main>
    </div>
  )
}
