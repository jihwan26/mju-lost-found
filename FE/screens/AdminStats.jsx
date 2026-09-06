import { useEffect, useState } from 'react';
import { get } from '../api.js';
import Banner from '../components/Banner.jsx';
import Loading from '../components/Loading.jsx';

/** 지표 한 칸. */
function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="faint">{sub}</div>}
    </div>
  );
}

/**
 * 관리자 대시보드 지표.
 * 서버가 COUNT 만 모아서 내려주므로 화면에서는 배치만 한다.
 */
export default function AdminStats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    get('/api/admin/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <Banner kind="error">{error}</Banner>;
  if (!stats) return <Loading />;

  return (
    <div className="section" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
      <h3>한눈에 보기</h3>
      <div className="stat-grid">
        <Stat label="전체 사용자" value={stats.users.total} sub={`오늘 +${stats.users.newToday}`} />
        <Stat label="정지 계정" value={stats.users.suspended} sub={`관리자 ${stats.users.admins}명`} />
        <Stat label="찾아요 글" value={stats.posts.lost} sub={`찾는 중 ${stats.posts.lostOpen}`} />
        <Stat label="찾았어요 글" value={stats.posts.found} sub={`보관 중 ${stats.posts.foundOpen}`} />
        <Stat label="매칭" value={stats.matches.total} sub={`완료 ${stats.matches.completed}`} />
        <Stat label="처리 대기 신고" value={stats.reports.pending}
          sub={`조치 ${stats.reports.actioned} · 반려 ${stats.reports.dismissed}`} />
        <Stat label="채팅방" value={stats.chats.rooms} sub={`메시지 ${stats.chats.messages}`} />
        <Stat label="댓글" value={stats.comments} sub={`오늘 새 글 ${stats.posts.newToday}`} />
      </div>
    </div>
  );
}
