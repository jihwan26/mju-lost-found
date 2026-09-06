import { useState } from 'react';
import { post } from '../api.js';
import Banner from '../components/Banner.jsx';
import LogoMark from '../components/LogoMark.jsx';

/** 로그인 안 된 상태의 첫 화면 (원본 app.py 의 비로그인 분기). */
export default function LoginScreen({ me, onRefresh }) {
  const [devEmail, setDevEmail] = useState('test@mju.ac.kr');
  const [error, setError] = useState('');
  // 서버가 OAuth 실패 시 /?login_error=... 로 되돌려 보낸다.
  const loginError = new URLSearchParams(window.location.search).get('login_error');

  async function devLogin() {
    setError('');
    try {
      await post('/api/auth/dev-login', { email: devEmail, name: devEmail.split('@')[0] });
      onRefresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: '48px auto' }}>
      <div className="page-head login-head">
        <LogoMark size={52} />
        <p className="login-univ">명지대학교</p>
        <h1>스마트 분실물 센터</h1>
        <p>교내에서 잃어버리거나 주운 물건을 등록하면, AI가 서로 맞는 글을 찾아줍니다.</p>
      </div>
      <Banner kind="error">{loginError || error}</Banner>

      <div className="card">
        {me.authConfigured ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              명지대학교 이메일({me.allowedDomain}) 계정으로만 이용할 수 있습니다.
            </p>
            {/* 서버가 Google 로 302 리다이렉트하므로 fetch 가 아니라 실제 페이지 이동이어야 한다. */}
            <button
              className="primary"
              style={{ width: '100%' }}
              onClick={() => { window.location.href = '/api/auth/google'; }}
            >
              Google로 로그인
            </button>
          </>
        ) : (
          <Banner kind="warn">
            Google 로그인이 아직 설정되지 않았습니다.
            {' '}환경변수 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 을 확인해주세요.
          </Banner>
        )}

        {me.devLoginEnabled && (
          <div className="section">
            <h3>개발용 로그인</h3>
            <p className="faint" style={{ marginTop: 0 }}>
              로컬 테스트 전용입니다. 배포 환경에서는 자동으로 비활성화됩니다.
            </p>
            <div className="field">
              <label>이메일</label>
              <input type="email" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} />
            </div>
            <button onClick={devLogin} style={{ width: '100%' }}>이 계정으로 로그인</button>
          </div>
        )}
      </div>
    </div>
  );
}
