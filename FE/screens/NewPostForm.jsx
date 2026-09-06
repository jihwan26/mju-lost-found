import { useState } from 'react';
import { sendForm } from '../api.js';
import { BOARD_META, nowHM, todayISO } from '../constants.js';
import Banner from '../components/Banner.jsx';

/**
 * 게시판 "새 글 등록" 탭 (원본 pages/1,2 의 등록 폼).
 *
 * 이미지가 섞이므로 JSON 이 아니라 FormData 로 보낸다.
 * 필수값 검사는 브라우저(required)와 서버 양쪽에서 하지만, 실제 강제는 서버 쪽이다.
 */
export default function NewPostForm({ kind, me, onCreated }) {
  const meta = BOARD_META[kind];
  const [form, setForm] = useState({
    title: '', description: '', category: me.categories[0], location: '',
    date: todayISO(), time: nowHM(),
  });
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('category', form.category);
      fd.append('location', form.location);
      // 서버의 날짜 검증 형식("YYYY-MM-DD HH:MM")에 맞춰 두 입력을 합친다.
      fd.append('at', `${form.date} ${form.time}`);
      // 서버가 upload.array('images') 로 받으므로 같은 이름으로 여러 번 붙인다.
      for (const f of files) fd.append('images', f);
      const { id } = await sendForm(`/api/posts/${kind}`, 'POST', fd);
      onCreated(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <p className="muted" style={{ marginTop: 0 }}>
        {meta.dateLabel}한 물건 정보를 입력해주세요. (* 필수)
      </p>
      <Banner kind="error">{error}</Banner>

      <div className="field">
        <label>제목 *</label>
        <input type="text" value={form.title} onChange={set('title')} required />
      </div>
      <div className="field">
        <label>설명 *</label>
        <textarea value={form.description} onChange={set('description')} required />
      </div>
      <div className="row">
        <div className="field">
          <label>카테고리 *</label>
          <select value={form.category} onChange={set('category')}>
            {me.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{meta.dateLabel} 장소 *</label>
          <input type="text" value={form.location} onChange={set('location')} placeholder="예: 인문캠퍼스 도서관" required />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>{meta.dateLabel} 날짜 *</label>
          <input type="date" value={form.date} onChange={set('date')} required />
        </div>
        <div className="field">
          <label>{meta.dateLabel} 시간 *</label>
          <input type="time" value={form.time} onChange={set('time')} required />
        </div>
      </div>
      <div className="field">
        <label>사진 (선택 · 최대 {me.maxPostImages}장 · jpg/jpeg/png, 각 5MB 이하)</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png"
          multiple
          onChange={(e) => setFiles([...e.target.files].slice(0, me.maxPostImages))}
        />
        {files.length > 0 && <p className="faint">{files.length}장 선택됨</p>}
      </div>

      <button className="primary" type="submit" disabled={busy}>
        {busy ? '등록 중...' : '등록하기'}
      </button>
    </form>
  );
}
