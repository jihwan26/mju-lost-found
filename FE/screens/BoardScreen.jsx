import { useState } from 'react';
import { navigate } from '../navigation.js';
import { BOARD_META } from '../constants.js';
import BoardList from './BoardList.jsx';
import NewPostForm from './NewPostForm.jsx';

/**
 * 찾아요(/lost) · 찾았어요(/found) 게시판의 껍데기 -- "목록" / "새 글 등록" 탭 전환.
 * (원본 pages/1_찾아요.py, 2_찾았어요.py 의 st.tabs)
 *
 * 두 게시판은 라벨과 필드명만 다르고 구조가 같아서, kind 로 갈라 쓰는 한 벌만 둔다.
 * 무엇이 다른지는 constants.js 의 BOARD_META 에 모여 있다.
 */
export default function BoardScreen({ kind, me }) {
  const meta = BOARD_META[kind];
  const [tab, setTab] = useState('list');

  return (
    <>
      <div className="page-head">
        <h1>{meta.heading}</h1>
        <p>{meta.subtitle}</p>
      </div>
      <div className="tabs">
        <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>목록</button>
        <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>새 글 등록</button>
      </div>
      {tab === 'list'
        ? <BoardList kind={kind} me={me} />
        : <NewPostForm kind={kind} me={me} onCreated={(id) => { setTab('list'); navigate(`/${kind}/${id}`); }} />}
    </>
  );
}
