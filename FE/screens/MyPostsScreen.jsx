import { useCallback, useEffect, useState } from 'react';
import { get } from '../api.js';
import Banner from '../components/Banner.jsx';
import Empty from '../components/Empty.jsx';
import Loading from '../components/Loading.jsx';
import MyPostCard from './MyPostCard.jsx';

/**
 * 내 게시물 (원본 pages/3_내_게시물.py).
 * 서버가 두 게시판을 한 번에 내려주므로 탭 전환에 추가 요청이 없다.
 */
export default function MyPostsScreen({ me }) {
  const [tab, setTab] = useState('lost');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    get('/api/my/posts').then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <div className="page-head">
        <h1>내 게시물</h1>
        <p>내가 작성한 게시물을 확인하고 수정·삭제·상태 변경을 할 수 있습니다.</p>
      </div>
      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      <div className="tabs">
        <button className={tab === 'lost' ? 'active' : ''} onClick={() => setTab('lost')}>내 찾아요 게시물</button>
        <button className={tab === 'found' ? 'active' : ''} onClick={() => setTab('found')}>내 찾았어요 게시물</button>
      </div>

      {!data ? <Loading /> : (
        data[tab].length === 0
          ? <Empty>작성한 {tab === 'lost' ? '찾아요' : '찾았어요'} 게시물이 없습니다.</Empty>
          : data[tab].map((p) => (
            <MyPostCard key={p.id} kind={tab} post={p} me={me} onChanged={load} />
          ))
      )}
    </>
  );
}
