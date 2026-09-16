/* src/ui/medidor.js */
(function (app) {
'use strict';


function criarMedidor() {
    const container = document.getElementById("gaugeContainer");
    if (!container) return;

    container.innerHTML = `
    <svg id="gaugeSvg" viewBox="0 0 240 180"
         xmlns="http://www.w3.org/2000/svg"
         style="width:100%;height:100%;max-width:320px;margin:0 auto;display:block;">
        <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#1b1c27;stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#0e0f16;stop-opacity:1"/>
            </linearGradient>
        </defs>

        <circle cx="120" cy="140" r="100" fill="url(#gaugeGrad)" stroke="#272838" stroke-width="1"/>
        <path d="M 40 140 A 80 80 0 0 1 200 140"
              fill="none" stroke="#0e0f16" stroke-width="14" stroke-linecap="round"/>
        <path id="gaugeArc" d="M 40 140 A 80 80 0 0 1 200 140"
              fill="none" stroke="#10b981" stroke-width="14"
              stroke-dasharray="251.3 251.3" stroke-dashoffset="0"
              style="transition:stroke-dashoffset .4s ease,stroke .3s ease"/>
        <text x="40" y="155" font-size="10" fill="#64748b" text-anchor="middle">0%</text>
        <text x="120" y="65" font-size="10" fill="#64748b" text-anchor="middle">50%</text>
        <text x="200" y="155" font-size="10" fill="#64748b" text-anchor="middle">100%</text>

        <g id="gaugeNeedleGroup"
           style="transform-origin:120px 140px;transition:transform .4s ease">
            <line x1="120" y1="140" x2="120" y2="50"
                  stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
            <circle cx="120" cy="140" r="7" fill="#38bdf8" stroke="#ffffff" stroke-width="2"/>
        </g>

        <circle cx="120" cy="140" r="10" fill="#0e0f16" stroke="#38bdf8" stroke-width="2"/>
        <text id="gaugePercent" x="120" y="25"
              text-anchor="middle" font-size="26" font-weight="bold"
              fill="#38bdf8">100%</text>
    </svg>`;
}

function atualizarMedidor(percentual, combustivelAtual, capacidadeTotal) {
    percentual = Math.max(0, Math.min(1, percentual));

    const arc = document.getElementById("gaugeArc");
    if (arc) {
        const circunferencia = 251.3;
        arc.style.strokeDashoffset = circunferencia * (1 - percentual);
        arc.setAttribute(
            "stroke",
            percentual >= 0.5 ? "#10b981" :
            percentual >= 0.25 ? "#f59e0b" : "#ef4444"
        );
    }

    const needle = document.getElementById("gaugeNeedleGroup");
    if (needle) {
        // 0% = -90° (esquerda), 50% = 0° (cima), 100% = +90° (direita)
        needle.style.transform = `rotate(${-90 + percentual * 180}deg)`;
    }

    const percentText = document.getElementById("gaugePercent");
    if (percentText) percentText.textContent = `${Math.round(percentual * 100)}%`;

    const readout = document.getElementById("gaugeReadout");
    if (readout) {
        readout.innerHTML =
            `Nível: <strong style="color:#38bdf8">${combustivelAtual.toFixed(1)} L</strong> / ${capacidadeTotal.toFixed(0)} L`;
    }
}

app.ui.medidor = { criarMedidor, atualizarMedidor };
})(window.RotaCombustivel);
