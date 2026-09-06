import { useState } from 'react';
import { patch } from '../api.js';
import Banner from '../components/Banner.jsx';
import TrustScore from '../components/TrustScore.jsx';

/**
 * 내 정보 (/me).
 * 명지도가 무엇인지 설명하고, 닉네임 변경을 여기서 처리한다.
 * 변경 가능 여부/남은 일수는 서버가 계산해 /api/me 로 내려주는 값을 그대로 쓴다.
 */
export default function ProfileScreen({ me, onRefresh }) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const change = me.user.nicknameChange ?? { canChange: false, daysLeft: 0 };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await patch('/api/me/nickname', { nickname });
      setNickname('');
      setNotice('닉네임이 변경되었습니다.');
      onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>내 정보</h1>
        <p>닉네임과 명지도를 확인할 수 있습니다.</p>
      </div>

      <Banner kind="error" onClose={() => setError('')}>{error}</Banner>
      <Banner kind="success" onClose={() => setNotice('')}>{notice}</Banner>

      <div className="card">
        <dl className="spec">
          <dt>닉네임</dt><dd><b>{me.user.nickname}</b></dd>
          <dt>이메일</dt><dd className="faint">{me.user.email}</dd>
          <dt>명지도</dt><dd><TrustScore score={me.user.trustScore} showLabel={false} /></dd>
          {me.user.isAdmin && <><dt>권한</dt><dd><span className="tag accent">관리자</span></dd></>}
        </dl>
      </div>

      <div className="section">
        <h3>명지도란</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          다른 사람이 나를 얼마나 믿고 거래할 수 있는지를 보여주는 점수입니다.
          모두 <b>50%</b>에서 시작하고 최대 100%까지 오릅니다.
        </p>
        <ul className="muted" style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>물건을 무사히 주고받아 양쪽이 &lsquo;돌려받았어요&rsquo;를 누르면 <b>+0.5%p</b></li>
          <li>신고가 접수되어 관리자 조치를 받으면 <b>−3%p</b></li>
        </ul>
      </div>

      <div className="section">
        <h3>닉네임 변경</h3>
        {change.canChange ? (
          <form onSubmit={submit}>
            <p className="muted" style={{ marginTop: 0 }}>
              닉네임은 {me.nicknameRules.changeDays}일에 한 번만 바꿀 수 있습니다.
            </p>
            <div className="field">
              <label>새 닉네임</label>
              <input
                type="text"
                value={nickname}
                maxLength={me.nicknameRules.max}
                placeholder={`한글/영문/숫자 ${me.nicknameRules.min}~${me.nicknameRules.max}자`}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <button className="primary" type="submit" disabled={busy || !nickname.trim()}>
              닉네임 변경
            </button>
          </form>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            최근에 닉네임을 바꾸셨습니다. <b>{change.daysLeft}일</b> 후에 다시 바꿀 수 있습니다.
          </p>
        )}
      </div>
    </>
  );
}
