import { useCallback, useEffect, useState } from 'react';
import { get, post, qs } from '../api.js';
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
  const [mode, setMode] = useState('keyword'); // keyword | ai
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('전체');
  const [status, setStatus] = useState('전체');
  const [posts, setPosts] = useState(null);
  const [aiResults, setAiResults] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 두 모드는 검색 대상 게시판이 반대라서 상태 선택지도 서로 다르다.
  const statusOptions = mode === 'keyword' ? meta.statuses : meta.aiStatuses;

  const loadKeyword = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setPosts(await get(`/api/posts/${kind}${qs({ keyword, category, status })}`));
    } catch (e) {
      setError(e.message);
      setPosts([]);
    } finally {
      setBusy(false);
    }
  }, [kind, keyword, category, status]);

  // 첫 진입 시 전체 목록을 보여준다 (Streamlit 이 매 실행마다 목록을 그리던 것과 같은 효과).
  useEffect(() => { loadKeyword(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);

  // 모드를 바꾸면 상태 필터 선택지가 통째로 달라지므로 "전체"로 되돌린다.
  function switchMode(next) {
    setMode(next);
    setStatus('전체');
    setAiResults(null);
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
        query: keyword, kind: meta.aiTargetKind, category, status,
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
      <div className="card">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button className={mode === 'keyword' ? 'active' : ''} onClick={() => switchMode('keyword')}>키워드 검색</button>
          <button className={mode === 'ai' ? 'active' : ''} onClick={() => switchMode('ai')}>AI 의미 검색</button>
        </div>
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
      </div>

      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      {busy && <Loading text={mode === 'ai' ? 'AI가 의미가 비슷한 게시물을 찾는 중입니다...' : '불러오는 중...'} />}

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

      {!busy && mode === 'ai' && (
        aiResults === null
          ? <Empty>문장으로 검색어를 입력하고 &lsquo;검색&rsquo; 버튼을 눌러보세요.<br />({meta.aiHint})</Empty>
          : aiResults.length === 0
            ? <Empty>의미가 비슷한 게시물을 찾지 못했습니다.</Empty>
            : (
              <>
                <p className="muted" style={{ marginBottom: 14 }}>
                  <b>AI 검색 결과 {aiResults.length}건</b><span className="sep">·</span>{meta.aiResultNote}
                </p>
                {/* 자유 문장 검색이라 짝지을 기준 게시물이 없다 -> 매칭 확정 버튼 없음 */}
                <MatchCandidates kind={meta.aiTargetKind} results={aiResults} />
              </>
            )
      )}
    </>
  );
}
