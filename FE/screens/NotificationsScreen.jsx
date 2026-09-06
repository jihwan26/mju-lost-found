import { useCallback, useEffect, useState } from 'react';
import { get, post, qs } from '../api.js';
import { navigate } from '../navigation.js';
import { NOTIFICATION_TYPE_LABELS } from '../constants.js';
import Banner from '../components/Banner.jsx';
import Empty from '../components/Empty.jsx';
import Loading from '../components/Loading.jsx';

const PAGE_SIZE = 20;

/**
 * 알림 (원본 pages/8_알림.py).
 *
 * "확인"을 누르면 서버가 읽음 처리 후 어디로 이동해야 하는지를 알려준다
 * (메시지 알림이면 그 채팅방, 매칭 알림이면 내 매칭). 이동할 곳이 없는
 * 제재/처리결과 알림은 읽음 처리만 하고 목록에 남는다.
 */
export default function NotificationsScreen({ onCountsChanged }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    get(`/api/notifications${qs({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [page]);
  useEffect(load, [load]);

  async function confirm(n) {
    setError('');
    setNotice('');
    try {
      const res = await post(`/api/notifications/${n.id}/read`, {});
      onCountsChanged();
      if (res.warning) setNotice(res.warning);
      if (res.navigate) { navigate(res.navigate); return; }
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function markAll() {
    try {
      await post('/api/notifications/read-all', {});
      onCountsChanged();
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>알림</h1>
        <p>읽지 않은 알림 {data?.unreadCount ?? 0}개</p>
      </div>
      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>
      <Banner kind="warn" onClose={() => setNotice('')}>{notice}</Banner>

      <button onClick={markAll} disabled={!data?.unreadCount} style={{ marginBottom: 14 }}>
        모두 읽음 처리
      </button>

      {!data ? <Loading /> : data.items.length === 0 ? <Empty>알림이 없습니다.</Empty> : data.items.map((n) => (
        <div className="card" key={n.id}>
          <div className="card-row">
            <div className="card-body">
              <p className="card-title">
                {!n.is_read && <span className="unread-dot" />}{n.title}
                {' '}<span className="pill">{NOTIFICATION_TYPE_LABELS[n.type] || n.type}</span>
              </p>
              <p className="desc" style={{ marginTop: 4 }}>{n.content}</p>
              <p className="faint">{n.created_at}</p>
            </div>
            <div className="card-actions">
              <button className="sm" onClick={() => confirm(n)}>확인</button>
            </div>
          </div>
        </div>
      ))}

      <div className="pager">
        <button className="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>이전 페이지</button>
        <span className="faint">{page + 1}페이지</span>
        <button className="sm" disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>다음 페이지</button>
      </div>
    </>
  );
}
