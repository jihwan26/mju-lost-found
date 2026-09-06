import { useCallback, useEffect, useState } from 'react';
import { get, qs } from '../api.js';
import Banner from '../components/Banner.jsx';
import Empty from '../components/Empty.jsx';
import Loading from '../components/Loading.jsx';
import AdminReportCard from './AdminReportCard.jsx';

const PAGE_SIZE = 20;

/**
 * 관리자 신고 목록 (원본 pages/7_관리자.py).
 *
 * 이 화면이 보인다고 관리자가 되는 건 아니다 -- 목록 API 자체가 서버에서
 * is_admin 을 다시 확인하므로, 주소를 직접 쳐서 들어와도 데이터가 내려오지 않는다.
 */
export default function AdminScreen() {
  const [status, setStatus] = useState('pending');
  const [targetType, setTargetType] = useState('전체');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setData(null);
    get(`/api/admin/reports${qs({ status, targetType, limit: PAGE_SIZE, offset: page * PAGE_SIZE })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status, targetType, page]);
  useEffect(load, [load]);

  // 필터가 바뀌면 첫 페이지로 되돌린다(안 그러면 3페이지가 비어 보이는 착시가 생긴다).
  function changeFilter(setter) {
    return (e) => { setter(e.target.value); setPage(0); };
  }

  return (
    <>
      <div className="page-head">
        <h1>신고 처리</h1>
        <p>신고된 게시물·메시지·사용자를 검토하고 처리합니다. 처리 후에는 되돌릴 수 없습니다.</p>
      </div>
      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>

      <div className="card">
        <div className="row">
          <div>
            <label className="faint">처리 상태</label>
            <select value={status} onChange={changeFilter(setStatus)}>
              <option value="pending">처리 대기</option>
              <option value="전체">전체</option>
              <option value="actioned">조치 완료</option>
              <option value="dismissed">반려</option>
            </select>
          </div>
          <div>
            <label className="faint">신고 유형</label>
            <select value={targetType} onChange={changeFilter(setTargetType)}>
              <option value="전체">전체</option>
              <option value="post">게시물</option>
              <option value="message">메시지</option>
              <option value="user">사용자</option>
            </select>
          </div>
        </div>
      </div>

      {!data ? <Loading /> : data.items.length === 0 ? <Empty>조건에 맞는 신고가 없습니다.</Empty>
        : data.items.map((r) => <AdminReportCard key={r.id} report={r} onProcessed={load} />)}

      <div className="pager">
        <button className="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>이전 페이지</button>
        <span className="faint">{page + 1}페이지</span>
        <button className="sm" disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>다음 페이지</button>
      </div>
    </>
  );
}
