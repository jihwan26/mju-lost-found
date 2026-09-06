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
    // 내가 주로 쓰는 캠퍼스를 기본값으로 -- 대부분 자기 캠퍼스에만 글을 쓴다.
    campus: me.user.campus, date: todayISO(), time: nowHM(),
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
      fd.append('campus', form.campus);
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
          <label>캠퍼스 *</label>
          <select value={form.campus} onChange={set('campus')}>
            {me.campuses.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.city})</option>)}
          </select>
        </div>
        <div className="field">
          <label>카테고리 *</label>
          <select value={form.category} onChange={set('category')}>
            {me.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label>{meta.dateLabel} 장소 *</label>
        {/* 건물 목록은 자동완성으로만 제안하고, 목록에 없는 곳도 그대로 쓸 수 있게 자유 입력. */}
        <input
          type="text"
          value={form.location}
          onChange={set('location')}
          placeholder="건물 이름을 입력하거나 목록에서 고르세요"
          list="campus-buildings"
          required
        />
        <datalist id="campus-buildings">
          {(me.campuses.find((c) => c.key === form.campus)?.buildings ?? [])
            .map((b) => <option key={b} value={b} />)}
        </datalist>
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
