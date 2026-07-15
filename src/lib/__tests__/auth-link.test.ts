import { classifyAuthLink, parseUrlFragment } from '../auth-link';

describe('parseUrlFragment', () => {
  it('връща null при URL без фрагмент', () => {
    expect(parseUrlFragment('imotnik://')).toBeNull();
    expect(parseUrlFragment('imotnik://reset-password?foo=bar')).toBeNull();
  });

  it('парсва параметрите след # (не query-то)', () => {
    const params = parseUrlFragment('imotnik://?query=1#access_token=abc&type=signup');
    expect(params?.get('access_token')).toBe('abc');
    expect(params?.get('type')).toBe('signup');
    expect(params?.get('query')).toBeNull();
  });

  it('декодира URL-encoded стойности', () => {
    const params = parseUrlFragment('imotnik://#error_description=Email+link+is+invalid+or+has+expired');
    expect(params?.get('error_description')).toBe('Email link is invalid or has expired');
  });
});

describe('classifyAuthLink', () => {
  it('разпознава signup confirmation токени във фрагмента', () => {
    const link = classifyAuthLink(
      'imotnik://#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=rrr&token_type=bearer&type=signup',
    );
    expect(link).toEqual({ kind: 'tokens', accessToken: 'aaa.bbb.ccc', refreshToken: 'rrr' });
  });

  it('дава приоритет на recovery по път (production build)', () => {
    const link = classifyAuthLink('imotnik://reset-password#access_token=aaa&refresh_token=rrr&type=recovery');
    expect(link).toEqual({ kind: 'recovery' });
  });

  it('дава приоритет на recovery по път (Expo Go)', () => {
    const link = classifyAuthLink('exp://192.168.1.5:8081/--/reset-password#access_token=aaa&refresh_token=rrr');
    expect(link).toEqual({ kind: 'recovery' });
  });

  it('дава приоритет на recovery по type=recovery дори без reset-password в пътя', () => {
    const link = classifyAuthLink('imotnik://#access_token=aaa&refresh_token=rrr&type=recovery');
    expect(link).toEqual({ kind: 'recovery' });
  });

  it('разпознава error фрагмент (изтекъл линк)', () => {
    const link = classifyAuthLink(
      'imotnik://#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    );
    expect(link).toEqual({
      kind: 'error',
      errorCode: 'otp_expired',
      errorDescription: 'Email link is invalid or has expired',
    });
  });

  it('разпознава error фрагмент само с error_code', () => {
    const link = classifyAuthLink('imotnik://#error_code=otp_expired');
    expect(link).toEqual({ kind: 'error', errorCode: 'otp_expired', errorDescription: null });
  });

  it('връща none при URL без фрагмент', () => {
    expect(classifyAuthLink('imotnik://')).toEqual({ kind: 'none' });
    expect(classifyAuthLink('exp://192.168.1.5:8081')).toEqual({ kind: 'none' });
  });

  it('връща none при фрагмент без токени и без грешка', () => {
    expect(classifyAuthLink('imotnik://#foo=bar')).toEqual({ kind: 'none' });
  });

  it('връща none при непълни токени (липсващ refresh_token)', () => {
    expect(classifyAuthLink('imotnik://#access_token=aaa&type=signup')).toEqual({ kind: 'none' });
  });
});
