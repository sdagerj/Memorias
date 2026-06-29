// Dictado por voz usando la Web Speech API del navegador (reconocimiento de voz).
// Disponible en Chrome/Edge y Safari (iOS 14.5+). Si no está, se desactiva el botón.

export function isVoiceSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

export class VoiceDictation {
  constructor({ lang = 'es-ES', onText, onState } = {}) {
    this.onText = onText || (() => {});
    this.onState = onState || (() => {});
    this.recognizing = false;
    this.recognition = null;

    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return;

    const r = new Rec();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (finalText) this.onText(finalText, true);
      if (interim) this.onText(interim, false);
    };

    r.onerror = (e) => {
      this.recognizing = false;
      this.onState('error', e.error);
    };

    r.onend = () => {
      // Reinicia si el usuario seguía grabando (algunos navegadores cortan solos).
      if (this.recognizing) {
        try { r.start(); } catch (_) { this.recognizing = false; this.onState('stopped'); }
      } else {
        this.onState('stopped');
      }
    };

    this.recognition = r;
  }

  toggle() {
    if (!this.recognition) return;
    if (this.recognizing) this.stop();
    else this.start();
  }

  start() {
    if (!this.recognition || this.recognizing) return;
    this.recognizing = true;
    try {
      this.recognition.start();
      this.onState('recording');
    } catch (_) {
      this.recognizing = false;
    }
  }

  stop() {
    if (!this.recognition) return;
    this.recognizing = false;
    try { this.recognition.stop(); } catch (_) {}
    this.onState('stopped');
  }
}
