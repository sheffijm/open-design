import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import { trackNewsletterResult, trackNewsletterSurfaceView } from '../analytics/events';

// The marketing site hosts the /subscribe Cloudflare Pages Function that
// writes to KV. The desktop client is served from a localhost daemon, so this
// POST is cross-origin — the function allowlists the client origins and
// returns CORS headers. A plain fetch (not the analytics-wrapped same-origin
// path) is correct here.
const SUBSCRIBE_URL = 'https://open-design.ai/subscribe';

const DISMISS_KEY = 'open-design:newsletter-dismissed';
// Delay the first appearance so the popup never competes with the entry view's
// initial paint or the updater prompt.
const SHOW_DELAY_MS = 20_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode / storage disabled — popup simply reappears next launch.
  }
}

export function NewsletterPopup() {
  const t = useT();
  const analytics = useAnalytics();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const surfaceTrackedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubmitState>('idle');

  useEffect(() => {
    if (readDismissed()) return;
    const timer = window.setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open || surfaceTrackedRef.current) return;
    surfaceTrackedRef.current = true;
    trackNewsletterSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'newsletter_popup',
    });
  }, [analytics.track, open]);

  const dismiss = useCallback(() => {
    setOpen(false);
    writeDismissed();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!wrapRef.current?.contains(target)) dismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [dismiss, open]);

  const submit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (state === 'submitting' || !EMAIL_RE.test(trimmed)) return;
      setState('submitting');
      void fetch(SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'client' }),
      })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('http error'))))
        .then((data: { ok?: boolean }) => {
          if (data?.ok !== true) throw new Error('rejected');
          setState('success');
          setEmail('');
          writeDismissed();
          trackNewsletterResult(analytics.track, {
            page_name: 'home',
            area: 'newsletter_popup',
            result: 'success',
          });
        })
        .catch(() => {
          setState('error');
          trackNewsletterResult(analytics.track, {
            page_name: 'home',
            area: 'newsletter_popup',
            result: 'error',
          });
        });
    },
    [analytics.track, email, state],
  );

  if (!open) return null;

  const dismissLabel = t('newsletter.dismiss');

  return (
    <section
      aria-labelledby="newsletter-popup-title"
      className="newsletter-popup"
      ref={wrapRef}
      role="dialog"
    >
      <button
        aria-label={dismissLabel}
        className="newsletter-popup__close"
        type="button"
        onClick={dismiss}
      >
        ×
      </button>
      <h2 className="newsletter-popup__title" id="newsletter-popup-title">
        {t('newsletter.title')}
      </h2>
      {state === 'success' ? (
        <p className="newsletter-popup__success">{t('newsletter.success')}</p>
      ) : (
        <>
          <p className="newsletter-popup__lead">{t('newsletter.lead')}</p>
          <form className="newsletter-popup__form" onSubmit={submit}>
            <input
              aria-label={t('newsletter.placeholder')}
              autoComplete="email"
              className="newsletter-popup__input"
              name="email"
              placeholder={t('newsletter.placeholder')}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button
              className="newsletter-popup__button"
              disabled={state === 'submitting'}
              type="submit"
            >
              {state === 'submitting' ? t('newsletter.subscribing') : t('newsletter.subscribe')}
            </button>
            {state === 'error' ? (
              <p className="newsletter-popup__error">{t('newsletter.error')}</p>
            ) : null}
          </form>
        </>
      )}
    </section>
  );
}
