import { useState, type FormEvent } from 'react';
import { gw } from './session';

type Form = { slug: string; label: string; max: string; days: number };

const bodyOf = (f: Form) => ({ slug: f.slug.trim().toLowerCase(), label: f.label.trim(), max_uses: f.max ? Number(f.max) : null, days: f.days });

function Fields({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  return (
    <>
        <label>Link name<input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required pattern="[A-Za-z0-9][A-Za-z0-9-]{1,39}" placeholder="cs2680" /></label>
        <label>Group<input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required maxLength={120} placeholder="CS 2680" /></label>
        <label>Most people (optional)<input type="number" min={1} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} /></label>
        <label>Open for (days)<input type="number" min={1} max={365} value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} /></label>
    </>
  );
}

/** A reusable join link for a class or an event: /join/<link name>, with an optional limit. */
export function AdminGroupLinks({ onMade }: { onMade: () => void }) {
  const empty: Form = { slug: '', label: '', max: '', days: 90 };
  const [form, setForm] = useState(empty);
  const [made, setMade] = useState<string | null>(null);
  const [error, setError] = useState('');
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const r = await gw<{ link: string }>('POST', '/admin/group-links', bodyOf(form));
      setMade(r.link);
      setForm(empty);
      onMade();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <section aria-label="Group links">
      <h2>Group links</h2>
      <p className="muted">One link for a whole class or event, such as <code>/join/cs2680</code>. Everyone who joins through it is listed with it under Users.</p>
      {error && <p className="tone-red" role="alert">{error}</p>}
      <form onSubmit={create} className="hosted-form inline">
        <Fields form={form} setForm={setForm} />
        <button className="btn btn-primary">Create group link</button>
      </form>
      {made && <p className="hosted-link"><code>{made}</code> <button className="btn" onClick={() => void navigator.clipboard?.writeText(made)}>Copy</button></p>}
    </section>
  );
}
