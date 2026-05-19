import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

function formatMonto(n, moneda = 'ARS') {
  return moneda === 'USD'
    ? `USD ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function ConfirmacionItems({ items, color, bg, renderLabel, renderMonto }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((item, j) => (
        <div key={j} style={{
          background: bg, border: `1px solid ${color}44`,
          borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontSize: 13 }}>{renderLabel(item)}</span>
          <span style={{ fontWeight: 700, color, fontSize: 13 }}>{renderMonto(item)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Chat() {
  const [mensajes, setMensajes] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get('/ia/historial').then(r => {
      setMensajes(r.data.map(m => {
        if (m.rol === 'assistant') {
          try {
            const match = m.contenido.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(match ? match[0] : m.contenido);
            return { rol: 'assistant', contenido: parsed.mensaje || m.contenido };
          } catch {
            return { rol: 'assistant', contenido: m.contenido };
          }
        }
        return { rol: m.rol, contenido: m.contenido };
      }));
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, loading]);

  async function enviar(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const texto = input.trim();
    setInput('');
    setMensajes(m => [...m, { rol: 'user', contenido: texto }]);
    setLoading(true);

    try {
      const { data } = await api.post('/ia/chat', { mensaje: texto });
      setMensajes(m => [...m, {
        rol: 'assistant',
        contenido: data.mensaje,
        gastosRegistrados: data.gastosRegistrados,
        recurrentesRegistrados: data.recurrentesRegistrados,
        ingresosRegistrados: data.ingresosRegistrados,
      }]);
    } catch (err) {
      setMensajes(m => [...m, { rol: 'assistant', contenido: '❌ ' + (err.response?.data?.error || 'Error al contactar la IA') }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    setMensajes(m => [...m, { rol: 'user', contenido: `📎 Subiendo archivo: ${file.name}...` }]);

    const form = new FormData();
    form.append('archivo', file);
    try {
      const { data } = await api.post('/ia/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMensajes(m => [...m, {
        rol: 'assistant',
        contenido: `✅ ${data.resumen}`,
        gastosRegistrados: data.gastosInsertados
      }]);
    } catch (err) {
      setMensajes(m => [...m, { rol: 'assistant', contenido: '❌ ' + (err.response?.data?.error || 'Error al procesar el archivo') }]);
    } finally {
      setUploadLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function limpiarHistorial() {
    await api.delete('/ia/historial');
    setMensajes([]);
  }

  const sugerencias = [
    'Gasté $2500 en el super',
    'Pagué la tarjeta de crédito $15000',
    '¿Cuánto gasté este mes?',
    'Almuerzo con amigos $3200',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>🤖 Chat con IA</h1>
          <p style={{ color: 'var(--text2)', fontSize: 13 }}>Hablale a la IA para registrar tus gastos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fileRef.current?.click()} className="btn btn-ghost" disabled={uploadLoading}>
            {uploadLoading ? <span className="spin" style={{ width: 14, height: 14 }} /> : '📎'} Subir archivo
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt" style={{ display: 'none' }} onChange={handleUpload} />
          {mensajes.length > 0 && (
            <button onClick={limpiarHistorial} className="btn btn-ghost" style={{ color: 'var(--danger)' }}>
              🗑️ Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Área de mensajes */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
        padding: '16px 0', marginBottom: 16
      }}>
        {mensajes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
            <p style={{ color: 'var(--text2)', marginBottom: 20 }}>¡Hola! Contame tus gastos y los registro automáticamente.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {sugerencias.map((s, i) => (
                <button key={i} onClick={() => setInput(s)} className="btn btn-ghost" style={{ fontSize: 13 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.rol === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '75%' }}>
              <div style={{
                padding: '12px 16px', borderRadius: m.rol === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: m.rol === 'user' ? 'var(--accent)' : 'var(--bg2)',
                border: m.rol === 'assistant' ? '1px solid var(--border)' : 'none',
                color: 'var(--text)', lineHeight: 1.6
              }}>
                {m.contenido}
              </div>
              {m.gastosRegistrados?.length > 0 && (
                <ConfirmacionItems items={m.gastosRegistrados} color="#22c55e" bg="#14532d22"
                  renderLabel={g => `${g.categoria_icono || '💰'} ${g.descripcion}`}
                  renderMonto={g => formatMonto(g.monto, g.moneda)} />
              )}
              {m.recurrentesRegistrados?.length > 0 && (
                <ConfirmacionItems items={m.recurrentesRegistrados} color="#6366f1" bg="#1e1b4b22"
                  renderLabel={g => `${g.categoria_icono || '💳'} ${g.descripcion}${g.tipo === 'cuota' ? ` (${g.cuota_actual}/${g.cuota_total})` : ' (fijo)'}`}
                  renderMonto={g => formatMonto(g.monto, g.moneda)} />
              )}
              {m.ingresosRegistrados?.length > 0 && (
                <ConfirmacionItems items={m.ingresosRegistrados} color="#f59e0b" bg="#78350f22"
                  renderLabel={i => `💰 ${i.descripcion}`}
                  renderMonto={i => formatMonto(i.monto, i.moneda)} />
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="spin" style={{ width: 16, height: 16 }} />
              <span style={{ color: 'var(--text2)' }}>Pensando...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={enviar} style={{ display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ej: Gasté $3200 en almuerzo, pagué el gas $1500..."
          disabled={loading}
          style={{ flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviar(e)}
        />
        <button type="submit" className="btn btn-primary" disabled={loading || !input.trim()} style={{ padding: '8px 20px' }}>
          Enviar
        </button>
      </form>
    </div>
  );
}
