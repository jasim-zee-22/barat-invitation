/* ================================================================
   BARAT INVITATION — SCRIPT
   Handles: Video flow, Countdown, Scroll reveals, Audio
   ================================================================ */

(function () {
  'use strict';

  /* ── DOM References ── */
  var overlay     = document.getElementById('envelope-overlay');
  var videoWrap   = document.getElementById('video-wrapper');
  var envVideo    = document.getElementById('envelope-video');
  var heroVideo   = document.getElementById('hero-video');
  var audio       = document.getElementById('bg-audio');
  var audioBtn    = document.getElementById('audio-btn');
  var iconPause   = document.getElementById('icon-pause');
  var iconPlay    = document.getElementById('icon-play');

  var started = false;

  /* Tracks a deliberate tap on the music button, so the auto-resume when the
     tab regains focus never overrides someone who chose silence. */
  var userMuted = false;
  var pausedByVisibility = false;

  /* ================================================================
     1. ENVELOPE → VIDEO → HERO FLOW
     ================================================================ */

  function beginSequence() {
    if (started) return;
    started = true;

    /* Fade out envelope overlay */
    overlay.classList.add('fade-out');
    setTimeout(function () {
      overlay.style.display = 'none';
    }, 1400);

    /* Music first, deliberately. Several browsers — iOS Safari especially —
       unlock only one media element per user gesture, and the audio is the
       only element here that needs one: both videos are muted + playsinline,
       which browsers allow to start unprompted. Playing the video first would
       spend the gesture and get the music refused. */
    if (audio) {
      audio.volume = 1;
      playAudio();
    }

    /* Show and play envelope video */
    videoWrap.classList.add('video-in');
    var vp = envVideo.play();
    if (vp && vp.catch) vp.catch(function () {});

    /* Backstop in case canplaythrough never fired — the hero video is needed
       the moment this one finishes. */
    warmHeroVideo();
  }

  function endEnvelopeVideo() {
    /* Fade out video wrapper */
    videoWrap.classList.remove('video-in');
    videoWrap.classList.add('video-out');
    setTimeout(function () {
      videoWrap.style.display = 'none';
    }, 1400);

    /* Unlock scrolling */
    document.body.classList.remove('locked');

    /* Start hero video loop */
    if (heroVideo) {
      var hp = heroVideo.play();
      if (hp && hp.catch) hp.catch(function () {});
    }

    /* Show audio button */
    if (audioBtn) {
      audioBtn.classList.add('visible');
    }
  }

  /* Click/tap to begin */
  overlay.addEventListener('click', beginSequence);
  overlay.addEventListener('touchstart', beginSequence, { passive: true });

  /* Detect envelope video near-end (0.8s before actual end) for smooth crossfade */
  envVideo.addEventListener('timeupdate', function () {
    if (envVideo.duration && envVideo.currentTime >= envVideo.duration - 0.8 && !envVideo.dataset.fading) {
      envVideo.dataset.fading = '1';
      endEnvelopeVideo();
    }
  });

  /* Fallback: if video ends without timeupdate trigger */
  envVideo.addEventListener('ended', function () {
    if (!envVideo.dataset.fading) {
      envVideo.dataset.fading = '1';
      endEnvelopeVideo();
    }
  });

  /* ================================================================
     0. STAGED MEDIA LOADING

     Everything ships with preload="none" so the envelope cover — the only
     thing on screen — gets the full connection. Each file is then warmed in
     turn, so by the time someone taps, the envelope video is usually ready:

       cover image onload  ->  envelope.mp4
       envelope.mp4 ready  ->  hero.mp4
       tap                 ->  barat.mp3 (loads as it plays)
     ================================================================ */

  var coverImg = overlay ? overlay.querySelector('.envelope-image') : null;

  /* Idempotent — the preload check means repeat calls are free */
  function warmMedia(el) {
    if (el && el.preload !== 'auto') {
      el.preload = 'auto';
      el.load();
    }
  }

  function warmEnvelopeVideo() { warmMedia(envVideo); }
  function warmHeroVideo()     { warmMedia(heroVideo); }

  if (coverImg && !coverImg.complete) {
    coverImg.addEventListener('load', warmEnvelopeVideo, { once: true });
    /* A broken cover must not strand the rest of the chain */
    coverImg.addEventListener('error', warmEnvelopeVideo, { once: true });
  } else {
    warmEnvelopeVideo();
  }

  /* canplaythrough is a hint the browser may never fire, so the tap handler
     warms the hero video too as a guaranteed backstop. */
  if (envVideo) {
    envVideo.addEventListener('canplaythrough', warmHeroVideo, { once: true });
  }

  /* ================================================================
     2. AUDIO TOGGLE
     ================================================================ */

  /* A <source> child does not populate audio.src — that property mirrors the
     src attribute on <audio> itself — so check every place a source can live. */
  function hasAudioSource() {
    return !!(audio && (audio.currentSrc || audio.getAttribute('src') || audio.querySelector('source')));
  }

  function playAudio() {
    if (!hasAudioSource()) return;
    var p = audio.play();
    /* A rejected play() leaves the element paused, so re-sync the button
       rather than letting it claim to be playing, then wait for another
       gesture to try again. */
    if (p && p.catch) {
      p.catch(function () {
        syncAudioIcons();
        armAudioRetry();
      });
    }
  }

  /* Safety net for a refused start: retry on the visitor's next interaction
     of any kind, so the music arrives on its own rather than waiting for
     someone to find the button. Never fires against a deliberate mute. */
  var retryEvents = ['pointerdown', 'touchstart', 'click', 'keydown'];
  var retryArmed = false;

  function armAudioRetry() {
    if (retryArmed || userMuted) return;
    retryArmed = true;

    for (var i = 0; i < retryEvents.length; i++) {
      document.addEventListener(retryEvents[i], retryAudio, { passive: true });
    }
  }

  function retryAudio() {
    retryArmed = false;
    for (var i = 0; i < retryEvents.length; i++) {
      document.removeEventListener(retryEvents[i], retryAudio);
    }
    if (!userMuted && audio && audio.paused) playAudio();
  }

  /* Driven by the element's real state rather than toggled by hand, so the
     icons cannot drift out of sync when playback is blocked or stalls. */
  function syncAudioIcons() {
    var playing = !!(audio && !audio.paused);
    if (iconPause) iconPause.style.display = playing ? 'block' : 'none';
    if (iconPlay)  iconPlay.style.display  = playing ? 'none'  : 'block';
    if (audioBtn) {
      audioBtn.setAttribute('aria-label', playing ? 'Pause background music' : 'Play background music');
      audioBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    }
  }

  if (audio) {
    audio.addEventListener('play', syncAudioIcons);
    audio.addEventListener('pause', syncAudioIcons);
    syncAudioIcons();
  }

  if (audioBtn && audio) {
    audioBtn.addEventListener('click', function () {
      if (audio.paused) {
        userMuted = false;
        playAudio();
      } else {
        audio.pause();
        userMuted = true;
      }
    });
  }

  /* Pause while the tab is hidden or the phone is locked. Only what we
     paused ourselves gets resumed, and never against a deliberate mute. */
  document.addEventListener('visibilitychange', function () {
    if (!audio || !started) return;

    if (document.hidden) {
      if (!audio.paused) {
        pausedByVisibility = true;
        audio.pause();
      }
    } else if (pausedByVisibility) {
      pausedByVisibility = false;
      if (!userMuted) playAudio();
    }
  });

  /* ================================================================
     3. COUNTDOWN TIMER
     ================================================================ */

  var targetDate = new Date('2026-09-26T18:00:00+05:00'); /* Sep 26, 2026, 6:00 PM PKT */

  var daysEl    = document.getElementById('cd-days');
  var hoursEl   = document.getElementById('cd-hours');
  var minsEl    = document.getElementById('cd-mins');
  var secsEl    = document.getElementById('cd-secs');

  function updateCountdown() {
    var now  = new Date();
    var diff = targetDate - now;

    if (diff <= 0) {
      /* Event has passed or is now */
      if (daysEl) daysEl.textContent = '0';
      if (hoursEl) hoursEl.textContent = '0';
      if (minsEl) minsEl.textContent = '0';
      if (secsEl) secsEl.textContent = '0';
      return;
    }

    var days  = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    var secs  = Math.floor((diff % (1000 * 60)) / 1000);

    /* Update with tick animation */
    updateDigit(daysEl, days);
    updateDigit(hoursEl, hours);
    updateDigit(minsEl, mins);
    updateDigit(secsEl, secs);
  }

  function updateDigit(el, value) {
    if (!el) return;
    var str = String(value);
    if (el.textContent !== str) {
      el.textContent = str;
      el.classList.remove('tick');
      /* Force reflow to restart animation */
      void el.offsetWidth;
      el.classList.add('tick');
    }
  }

  /* Run countdown */
  updateCountdown();
  setInterval(updateCountdown, 1000);

  /* ================================================================
     4. SCROLL REVEAL (IntersectionObserver)
     ================================================================ */

  var revealElements = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    /* Fallback: just show everything */
    revealElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  /* ================================================================
     5. TIMELINE FLOWER — travels down to each event on scroll
     ================================================================ */

  var timeline = document.querySelector('.timeline');
  var rose     = timeline ? timeline.querySelector('.timeline-rose') : null;
  var line     = timeline ? timeline.querySelector('.timeline-line') : null;
  var lineFill = timeline ? timeline.querySelector('.timeline-line-fill') : null;
  var stops    = timeline ? timeline.querySelectorAll('.timeline-item') : [];

  if (timeline && rose && stops.length) {
    var activeStop = 0;
    var firstStopY = 0;

    /* Centre of an event row, relative to .timeline (its offsetParent).
       offsetTop is layout-based, so the reveal animation's translateY does
       not throw this off mid-flight. */
    var stopCenter = function (item) {
      return item.offsetTop + item.offsetHeight / 2;
    };

    /* Pin the line between the first and last markers, measured rather than
       hardcoded, so it lands exactly on a marker at any font size. */
    var layoutLine = function () {
      firstStopY = stopCenter(stops[0]);
      var lastY  = stopCenter(stops[stops.length - 1]);

      if (line) {
        line.style.top    = firstStopY + 'px';
        line.style.height = Math.max(0, lastY - firstStopY) + 'px';
        line.style.bottom = 'auto';
      }
      if (lineFill) {
        lineFill.style.top = firstStopY + 'px';
      }
    };

    var moveRoseTo = function (index, pulse) {
      var item = stops[index];
      if (!item) return;

      var y = stopCenter(item);

      rose.style.top = y + 'px';
      rose.style.transform = 'rotate(' + (index * 28) + 'deg)';

      /* Trail the gold line behind it, from the first marker down */
      if (lineFill) {
        lineFill.style.height = Math.max(0, y - firstStopY) + 'px';
      }

      if (pulse) {
        rose.classList.remove('is-settling');
        void rose.offsetWidth; /* force reflow so the animation restarts */
        rose.classList.add('is-settling');
      }
    };

    /* Seat it on the first event before anything is on screen */
    layoutLine();
    moveRoseTo(0, false);

    /* Text metrics shift once the web fonts land, so re-measure */
    window.addEventListener('load', function () {
      layoutLine();
      moveRoseTo(activeStop, false);
    });

    window.addEventListener('resize', function () {
      layoutLine();
      moveRoseTo(activeStop, false);
    });

    if ('IntersectionObserver' in window) {
      /* Fade the flower in with the section */
      var roseObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            rose.classList.add('is-visible');
            roseObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2 });

      roseObserver.observe(timeline);

      /* Track which events have crossed into the upper part of the screen.
         Reading the whole set each time — rather than reacting to a single
         entry — keeps this correct no matter what order entries arrive in. */
      var crossed = [];
      for (var s = 0; s < stops.length; s++) {
        crossed.push(false);
      }

      var stopObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var idx = Array.prototype.indexOf.call(stops, entry.target);
          if (idx !== -1) crossed[idx] = entry.isIntersecting;
        });

        /* Furthest event crossed wins, so the flower advances on the way
           down and walks back up again in reverse. */
        var next = 0;
        for (var j = 0; j < crossed.length; j++) {
          if (crossed[j]) next = j;
        }

        if (next !== activeStop) {
          activeStop = next;
          moveRoseTo(next, true);
        }
      }, { rootMargin: '0px 0px -55% 0px' });

      for (var k = 0; k < stops.length; k++) {
        stopObserver.observe(stops[k]);
      }
    } else {
      rose.classList.add('is-visible');
    }
  }

  /* ================================================================
     6. FALLING PETALS — Location section
     ================================================================ */

  var petalField  = document.querySelector('.petal-field');
  var locationSec = document.getElementById('location');

  if (petalField && locationSec) {
    var PETAL_SPRITES = 5;
    var PETAL_COUNT   = 14;

    var rand = function (min, max) {
      return min + Math.random() * (max - min);
    };

    for (var p = 0; p < PETAL_COUNT; p++) {
      var petal = document.createElement('span');
      petal.className = 'petal';

      var petalImg = document.createElement('img');
      /* Cycle the five sprites so each is used an even number of times */
      petalImg.src = 'assets/falling-petal-' + ((p % PETAL_SPRITES) + 1) + '.png';
      petalImg.alt = '';
      petal.appendChild(petalImg);

      petal.style.left = rand(0, 96).toFixed(2) + '%';
      petal.style.setProperty('--size',     rand(14, 28).toFixed(0) + 'px');
      petal.style.setProperty('--drift',    rand(18, 55).toFixed(0) + 'px');
      petal.style.setProperty('--spin',     rand(60, 200).toFixed(0) + 'deg');
      petal.style.setProperty('--duration', rand(6, 10).toFixed(1) + 's');
      /* Tight stagger — every petal still enters from the top edge, but the
         field reaches full density in well under two seconds. The varied
         durations above pull them out of phase over the next few cycles. */
      petal.style.setProperty('--delay',    rand(0, 1.4).toFixed(1) + 's');
      petal.style.setProperty('--sway',     rand(2.5, 5).toFixed(1) + 's');
      petal.style.setProperty('--opacity',  rand(0.45, 0.85).toFixed(2));

      petalField.appendChild(petal);
    }

    /* How far a petal has to travel to clear the section entirely */
    var sizePetalField = function () {
      petalField.style.setProperty('--fall', (locationSec.offsetHeight + 120) + 'px');
    };

    sizePetalField();
    window.addEventListener('load', sizePetalField);
    window.addEventListener('resize', sizePetalField);

    if ('IntersectionObserver' in window) {
      var petalObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          /* Paused rather than removed, so petals keep their place in the
             cycle instead of restarting every time the section scrolls by */
          if (entry.isIntersecting) {
            petalField.classList.add('is-falling');
          } else {
            petalField.classList.remove('is-falling');
          }
        });
      }, { threshold: 0 });

      petalObserver.observe(locationSec);
    } else {
      petalField.classList.add('is-falling');
    }
  }

})();
