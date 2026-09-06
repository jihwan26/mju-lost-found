import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post, qs, sendForm } from '../api.js';
import { navigate } from '../navigation.js';
import { BOARD_META } from '../constants.js';
import Banner from '../components/Banner.jsx';
import Empty from '../components/Empty.jsx';
import Loading from '../components/Loading.jsx';
import Thumb from '../components/Thumb.jsx';
import StatusPill from '../components/StatusPill.jsx';
import MatchCandidates from '../components/MatchCandidates.jsx';

/**
 * 게시판 "목록" 탭 -- 검색창 + 결과 목록.
 *
 * 검색 방식이 두 가지다:
 *   keyword : 이 게시판 안에서 제목/설명을 LIKE 로 찾는다.
 *   ai      : 문장으로 입력해 *반대편* 게시판에서 의미가 비슷한 글을 찾는다.
 *             (찾아요에서 검색 -> 습득물이 나옴)
 */
export default function BoardList({ kind, me }) {
  const meta = BOARD_META[kind];
  const [mode, setMode] = useState('keyword'); // keyword | ai | image
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('전체');
  const [status, setStatus] = useState('전체');
  // 캠퍼스는 게시판 전체에 걸리는 필터라 검색 폼 밖(탭)으로 뺐다.
  const [campus, setCampus] = useState(me.user.campus);
  const [posts, setPosts] = useState(null);
  const [aiResults, setAiResults] = useState(null);
  // 사진 검색이 사진을 어떻게 읽었는지 보여줘야 사용자가 결과를 납득한다.
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  // 두 모드는 검색 대상 게시판이 반대라서 상태 선택지도 서로 다르다.
  const statusOptions = mode === 'keyword' ? meta.statuses : meta.aiStatuses;

  const loadKeyword = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setPosts(await get(`/api/posts/${kind}${qs({ keyword, category, status, campus })}`));
    } catch (e) {
      setError(e.message);
      setPosts([]);
    } finally {
      setBusy(false);
    }
  }, [kind, keyword, category, status, campus]);

  // 첫 진입 시, 그리고 캠퍼스를 바꿀 때마다 목록을 다시 불러온다.
  useEffect(() => { loadKeyword(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind, campus]);

  // 모드를 바꾸면 상태 필터 선택지가 통째로 달라지므로 "전체"로 되돌린다.
  function switchMode(next) {
    setMode(next);
    setStatus('전체');
    setAiResults(null);
    setCaption('');
  }

  /** 사진으로 검색. 서버가 사진을 검색어로 바꾼 뒤 의미 검색을 태운다. */
  async function searchByImage(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setCaption('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('kind', meta.aiTargetKind);
      if (category !== '전체') fd.append('category', category);
      if (status !== '전체') fd.append('status', status);
      fd.append('campus', campus);
      const data = await sendForm('/api/ai/image-search', 'POST', fd);
      setCaption(data.caption);
      setAiResults(data.results);
    } catch (err) {
      setAiResults(null);
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function runSearch(e) {
    e.preventDefault();
    if (mode === 'keyword') { loadKeyword(); return; }

    if (!keyword.trim()) {
      setAiResults(null);
      setError('문장으로 검색어를 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await post('/api/ai/search', {
        query: keyword, kind: meta.aiTargetKind, category, status, campus,
      });
      setAiResults(data.results);
    } catch (err) {
      setAiResults(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 캠퍼스 전환 -- 인문/자연은 서로 다른 지역이라 글이 섞이면 방해가 된다. */}
      <div className="campus-tabs">
        {me.campuses.map((c) => (
          <button
            key={c.key}
            className={campus === c.key ? 'active' : ''}
            onClick={() => setCampus(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button className={mode === 'keyword' ? 'active' : ''} onClick={() => switchMode('keyword')}>키워드 검색</button>
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => switchMode('ai')}>AI 의미 검색</button>
          {me.imageSearchEnabled && (
            <button className={mode === 'image' ? 'active' : ''} onClick={() => switchMode('image')}>사진으로 검색</button>
          )}
        </div>
        {mode === 'image' ? (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>
              잃어버린 물건과 비슷한 사진을 올리면, AI가 사진을 읽어 비슷한 게시물을 찾아줍니다.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png"
              disabled={busy}
              onChange={(e) => searchByImage(e.target.files[0])}
            />
          </div>
        ) : (
        <form onSubmit={runSearch}>
          <div className="row">
            <div style={{ flex: 2 }}>
              <label className="faint">{mode === 'keyword' ? '검색어' : '검색어 (문장으로 입력해보세요)'}</label>
              <input
                type="text"
                value={keyword}
                placeholder={mode === 'keyword' ? '예: 에어팟' : meta.aiHint}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <div>
              <label className="faint">카테고리</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {['전체', ...me.categories].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="faint">상태</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 0, minWidth: 90, display: 'flex', alignItems: 'flex-end' }}>
              <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>검색</button>
            </div>
          </div>
        </form>
        )}
      </div>

      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      {busy && (
        <Loading text={
          mode === 'image' ? 'AI가 사진을 읽는 중입니다...'
            : mode === 'ai' ? 'AI가 의미가 비슷한 게시물을 찾는 중입니다...'
              : '불러오는 중...'
        } />
      )}

      {!busy && mode === 'keyword' && (
        posts === null ? null
          : posts.length === 0 ? <Empty>조건에 맞는 게시물이 없습니다.</Empty>
            : (
              <>
                <p className="faint" style={{ marginBottom: 6 }}>{posts.length}건</p>
                <div className="list">
                  {posts.map((p) => (
                    <div className="list-item" key={p.id}>
                      <Thumb src={p.images?.[0]} count={p.images?.length} />
                      <div className="list-body">
                        <p className="item-title">{p.title}</p>
                        <p className="meta">
                          {p.category}<span className="sep">·</span>{p.location}
                          <span className="sep">·</span>{p[meta.dateField]}
                        </p>
                        <p className="faint">
                          {p.author_nickname}<span className="sep">·</span>
                          <StatusPill status={p.status} />
                          <span className="sep">·</span>조회 {p.view_count ?? 0}
                          {p.comment_count > 0 && <><span className="sep">·</span>댓글 {p.comment_count}</>}
                        </p>
                      </div>
                      <div className="list-actions">
                        <button className="sm" onClick={() => navigate(`/${kind}/${p.id}`)}>상세보기</button>
                        {/* 새 탭 링크 -- 현재 탭의 검색 조건을 전혀 건드리지 않는다.
                            진짜 <a> 여야 브라우저의 "새 탭에서 열기"가 동작하므로,
                            <button> 을 감싸지 않고 링크 자체를 버튼처럼 꾸민다. */}
                        <a className="linkbtn" href={`/${kind}/${p.id}`} target="_blank" rel="noreferrer">
                          새 탭
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
      )}

      {!busy && (mode === 'ai' || mode === 'image') && (
        aiResults === null
          ? (
            <Empty>
              {mode === 'image'
                ? '사진을 올리면 비슷한 게시물을 찾아드립니다.'
                : <>문장으로 검색어를 입력하고 &lsquo;검색&rsquo; 버튼을 눌러보세요.<br />({meta.aiHint})</>}
            </Empty>
          )
          : (
            <>
              {caption && (
                <p className="muted" style={{ marginBottom: 10 }}>
                  AI가 읽은 사진: <b>{caption}</b>
                </p>
              )}
              {aiResults.length === 0
                ? <Empty>비슷한 게시물을 찾지 못했습니다.</Empty>
                : (
                  <>
                    <p className="muted" style={{ marginBottom: 14 }}>
                      <b>검색 결과 {aiResults.length}건</b><span className="sep">·</span>{meta.aiResultNote}
                    </p>
                    {/* 기준 게시물이 없는 검색이라 매칭 확정 버튼은 붙이지 않는다. */}
                    <MatchCandidates kind={meta.aiTargetKind} results={aiResults} />
                  </>
                )}
            </>
          )
      )}
    </>
  );
}
