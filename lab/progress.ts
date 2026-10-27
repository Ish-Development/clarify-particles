// A button that shows a long job's progress on itself: a fill behind its
// label, the % and the seconds left, then what came of it. Clicked while it
// runs, it asks the job to stop.
export function progressButton(btn: HTMLElement) {
  const label = btn.textContent ?? "";
  let stopped = false;
  let timer = 0;
  const show = (text: string) => {
    btn.textContent = "";
    const span = document.createElement("span");
    span.textContent = text;
    btn.append(span);
  };
  return {
    get stopped() {
      return stopped;
    },
    start() {
      clearTimeout(timer);
      stopped = false;
      btn.classList.add("busy");
      btn.classList.remove("done");
      btn.style.setProperty("--p", "0");
      btn.title = "Click to stop";
      show("Preparing…");
    },
    set(p: number, secondsLeft: number) {
      btn.style.setProperty("--p", String(p));
      show(`Exporting ${Math.round(p * 100)}% · ${Math.ceil(secondsLeft)} s`);
    },
    // clicked while running
    stop() {
      stopped = true;
      show("Stopping…");
    },
    end(text: string) {
      btn.classList.remove("busy");
      btn.classList.add("done");
      btn.title = "";
      show(text);
      timer = window.setTimeout(() => {
        btn.classList.remove("done");
        btn.textContent = label;
      }, 3500);
    },
  };
}
