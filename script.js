(function () {
  "use strict";

  /* ---- DOM refs ---- */
  const syncEl        = document.getElementById("syncStatus");
  const siteSelect    = document.getElementById("siteSelect");
  const cableLenInput = document.getElementById("cableLenInput");
  const startMonthSel = document.getElementById("startMonth");
  const startYearSel  = document.getElementById("startYear");
  const endMonthSel   = document.getElementById("endMonth");
  const endYearSel    = document.getElementById("endYear");
  const wellChecksDiv = document.getElementById("wellChecks");
  const selectAllBtn  = document.getElementById("selectAllWellsBtn");
  const clearWellsBtn = document.getElementById("clearWellsBtn");
  const analyzeBtn    = document.getElementById("analyzeBtn");
  const statusNote    = document.getElementById("statusNote");
  const summaryCards  = document.getElementById("summaryCards");

  /* ---- state ---- */
  let rawRows = [];
  let colMap  = {};

  /* ---- helpers ---- */
  function findCol(headers, keyword) {
    return headers.findIndex(h => h.toLowerCase().includes(keyword.toLowerCase()));
  }

  function toNum(v) {
    if (v === undefined || v === null || v === "") return NaN;
    return Number(v);
  }

  function std(arr) {
    const n = arr.length;
    if (n < 2) return 0;
    const m = arr.reduce((a, b) => a + b, 0) / n;
    const ss = arr.reduce((a, v) => a + (v - m) * (v - m), 0);
    return Math.sqrt(ss / (n - 1));
  }

  function mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* ---- month names ---- */
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function populateMonthSelect(sel, defaultVal) {
    sel.innerHTML = "";
    for (let i = 1; i <= 12; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = monthNames[i - 1];
      if (i === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function populateYearSelect(sel, years, defaultVal) {
    sel.innerHTML = "";
    years.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  /* ---- tabs ---- */
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tabContent").forEach(tc => tc.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      window.dispatchEvent(new Event("resize"));
    });
  });

  /* ---- load CSV ---- */
  Papa.parse(defined_csv, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      rawRows = results.data;
      const headers = results.meta.fields;

      colMap.site    = headers.find(h => h.toLowerCase().includes("site")) || "";
      colMap.hole    = headers.find(h => h.toLowerCase().includes("hole")) || "";
      colMap.date    = headers.find(h => h.toLowerCase().includes("date")) || "";
      colMap.cable   = headers.find(h => h.toLowerCase().includes("cable")) || "";
      colMap.neutron = headers.find(h => h.toLowerCase().includes("neutron")) || "";

      if (!colMap.site || !colMap.hole || !colMap.date || !colMap.cable || !colMap.neutron) {
        syncEl.textContent = "Error: could not find required columns.";
        return;
      }

      /* sites */
      const sites = [...new Set(rawRows.map(r => (r[colMap.site] || "").trim()).filter(Boolean))].sort();
      siteSelect.innerHTML = "";
      sites.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        if (s.toLowerCase() === "rivendell") opt.selected = true;
        siteSelect.appendChild(opt);
      });

      /* years */
      const allYears = [...new Set(rawRows.map(r => {
        const d = r[colMap.date];
        if (!d) return null;
        const y = parseInt(d.substring(0, 4));
        return isNaN(y) ? null : y;
      }).filter(Boolean))].sort();

      populateMonthSelect(startMonthSel, 1);
      populateMonthSelect(endMonthSel, 12);
      populateYearSelect(startYearSel, allYears, allYears.length ? allYears[allYears.length - 1] : 2023);
      populateYearSelect(endYearSel, allYears, allYears.length ? allYears[allYears.length - 1] : 2026);

      syncEl.textContent = rawRows.length.toLocaleString() + " rows loaded.";

      siteSelect.addEventListener("change", updateWellList);
      updateWellList();
    },
    error: function () {
      syncEl.textContent = "Error loading CSV.";
    }
  });

  /* ---- well checkboxes ---- */
  function updateWellList() {
    const site = siteSelect.value;
    const wells = [...new Set(
      rawRows
        .filter(r => (r[colMap.site] || "").trim().toLowerCase() === site.toLowerCase())
        .map(r => (r[colMap.hole] || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    wellChecksDiv.innerHTML = "";
    wells.forEach(w => {
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = w;
      cb.checked = true;
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(" " + w));
      wellChecksDiv.appendChild(lbl);
    });
  }

  selectAllBtn.addEventListener("click", () => {
    wellChecksDiv.querySelectorAll("input").forEach(cb => cb.checked = true);
  });

  clearWellsBtn.addEventListener("click", () => {
    wellChecksDiv.querySelectorAll("input").forEach(cb => cb.checked = false);
  });

  /* ---- analyze ---- */
  analyzeBtn.addEventListener("click", runAnalysis);

  function runAnalysis() {
    statusNote.textContent = "";
    statusNote.classList.remove("error");

    const site = siteSelect.value;
    const cableLen = toNum(cableLenInput.value);
    const sY = parseInt(startYearSel.value);
    const sM = parseInt(startMonthSel.value);
    const eY = parseInt(endYearSel.value);
    const eM = parseInt(endMonthSel.value);

    const selectedWells = new Set();
    wellChecksDiv.querySelectorAll("input:checked").forEach(cb => selectedWells.add(cb.value));

    if (selectedWells.size === 0) {
      statusNote.textContent = "Select at least one well.";
      statusNote.classList.add("error");
      return;
    }

    const startDate = new Date(sY, sM - 1, 1);
    const endDate = new Date(eY, eM, 0); // last day of end month

    /* filter rows */
    const filtered = rawRows.filter(r => {
      if ((r[colMap.site] || "").trim().toLowerCase() !== site.toLowerCase()) return false;
      const cable = toNum(r[colMap.cable]);
      if (cable !== cableLen) return false;
      const hole = (r[colMap.hole] || "").trim();
      if (!selectedWells.has(hole)) return false;
      const d = new Date(r[colMap.date]);
      if (isNaN(d)) return false;
      if (d < startDate || d > endDate) return false;
      const nc = toNum(r[colMap.neutron]);
      if (isNaN(nc)) return false;
      return true;
    });

    if (filtered.length === 0) {
      statusNote.textContent = "No data found for these filters.";
      statusNote.classList.add("error");
      return;
    }

    /* group by well + year-month */
    const groups = {};
    filtered.forEach(r => {
      const hole = (r[colMap.hole] || "").trim();
      const d = new Date(r[colMap.date]);
      const ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      const key = hole + "_" + ym;
      if (!groups[key]) groups[key] = { well: hole, ym: ym, counts: [] };
      groups[key].counts.push(toNum(r[colMap.neutron]));
    });

    /* compute stats per group */
    const details = [];
    const warnings = [];

    Object.values(groups).forEach(g => {
      const c = g.counts.filter(v => !isNaN(v));
      const n = c.length;

      if (n < 2) {
        warnings.push('SKIPPED: "' + g.well + ' ' + g.ym + '" has only ' + n + ' measurement(s)');
        return;
      }
      if (n !== 3) {
        warnings.push('WARNING: "' + g.well + ' ' + g.ym + '" has ' + n + ' measurements (expected 3)');
      }

      const m = mean(c);
      const sd = std(c);
      const cv = (sd / m) * 100;

      details.push({
        well: g.well,
        ym: g.ym,
        n: n,
        mean: m,
        sd: sd,
        cv: cv
      });
    });

    if (details.length === 0) {
      statusNote.textContent = "No valid triplet groups found.";
      statusNote.classList.add("error");
      return;
    }

    details.sort((a, b) => a.well.localeCompare(b.well, undefined, { numeric: true }) || a.ym.localeCompare(b.ym));

    /* overall stats */
    const allSD = details.map(d => d.sd);
    const allCV = details.map(d => d.cv);

    const overall = {
      sessions: details.length,
      meanSD: mean(allSD),
      medianSD: median(allSD),
      minSD: Math.min(...allSD),
      maxSD: Math.max(...allSD),
      meanCV: mean(allCV),
      medianCV: median(allCV),
      minCV: Math.min(...allCV),
      maxCV: Math.max(...allCV)
    };

    /* per-well stats */
    const wellNames = [...new Set(details.map(d => d.well))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const wellStats = wellNames.map(w => {
      const wd = details.filter(d => d.well === w);
      const sds = wd.map(d => d.sd);
      const cvs = wd.map(d => d.cv);
      const means = wd.map(d => d.mean);
      return {
        well: w,
        sessions: wd.length,
        meanCount: mean(means),
        meanSD: mean(sds),
        medianSD: median(sds),
        maxSD: Math.max(...sds),
        meanCV: mean(cvs),
        medianCV: median(cvs),
        maxCV: Math.max(...cvs)
      };
    });

    /* render everything */
    renderSummary(overall, warnings, site, cableLen, sY, sM, eY, eM);
    renderCvBar(wellStats, site, cableLen);
    renderSdBox(details, wellNames, site, cableLen);
    renderSdTime(details, wellNames, site, cableLen);
    renderCvTime(details, wellNames, site, cableLen);
    renderWellTable(wellStats);
    renderDetailTable(details);

    statusNote.textContent = details.length + " sessions analyzed across " + wellNames.length + " wells.";
  }

  /* ---- renderers ---- */

  function renderSummary(o, warnings, site, cable, sY, sM, eY, eM) {
    const range = monthNames[sM - 1] + " " + sY + " – " + monthNames[eM - 1] + " " + eY;

    let html = '';

    html += '<div class="card full"><h3>Analysis</h3>';
    html += '<div class="metric"><span class="label">Site:</span> <span class="value">' + site + '</span></div>';
    html += '<div class="metric"><span class="label">Cable length:</span> <span class="value">' + cable + ' ft</span></div>';
    html += '<div class="metric"><span class="label">Date range:</span> <span class="value">' + range + '</span></div>';
    html += '<div class="metric"><span class="label">Sessions:</span> <span class="value">' + o.sessions + '</span></div>';
    html += '</div>';

    html += '<div class="card"><h3>Standard Deviation</h3>';
    html += metric("Mean", o.meanSD.toFixed(2));
    html += metric("Median", o.medianSD.toFixed(2));
    html += metric("Min", o.minSD.toFixed(2));
    html += metric("Max", o.maxSD.toFixed(2));
    html += '</div>';

    html += '<div class="card"><h3>Coefficient of Variation</h3>';
    html += metric("Mean", o.meanCV.toFixed(3) + "%");
    html += metric("Median", o.medianCV.toFixed(3) + "%");
    html += metric("Min", o.minCV.toFixed(3) + "%");
    html += metric("Max", o.maxCV.toFixed(3) + "%");
    html += '</div>';

    if (warnings.length > 0) {
      html += '<div class="card full"><h3>Warnings</h3><div class="warnings">';
      warnings.forEach(w => { html += '<p>' + w + '</p>'; });
      html += '</div></div>';
    }

    summaryCards.innerHTML = html;
  }

  function metric(label, value) {
    return '<div class="metric"><span class="label">' + label + ':</span> <span class="value">' + value + '</span></div>';
  }

  function renderCvBar(wellStats, site, cable) {
    const trace = {
      x: wellStats.map(w => w.well),
      y: wellStats.map(w => w.meanCV),
      type: "bar",
      marker: { color: "#2F6F62" }
    };

    const layout = {
      title: "CV by Well (" + site + ", " + cable + " ft)",
      xaxis: { title: "Well", type: "category" },
      yaxis: { title: "Mean CV (%)" },
      margin: { t: 50, b: 80, l: 60, r: 20 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "#FFFFFF",
      font: { family: "IBM Plex Sans" }
    };

    Plotly.newPlot("plotCvBar", [trace], layout, { responsive: true });
  }

  function renderSdBox(details, wellNames, site, cable) {
    const traces = wellNames.map(w => ({
      y: details.filter(d => d.well === w).map(d => d.sd),
      name: w,
      type: "box",
      boxpoints: "outliers"
    }));

    const layout = {
      title: "SD by Well (" + site + ", " + cable + " ft)",
      yaxis: { title: "Standard Deviation (counts)" },
      showlegend: false,
      margin: { t: 50, b: 80, l: 60, r: 20 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "#FFFFFF",
      font: { family: "IBM Plex Sans" }
    };

    Plotly.newPlot("plotSdBox", traces, layout, { responsive: true });
  }

  function renderSdTime(details, wellNames, site, cable) {
    const traces = wellNames.map(w => {
      const wd = details.filter(d => d.well === w).sort((a, b) => a.ym.localeCompare(b.ym));
      return {
        x: wd.map(d => d.ym + "-01"),
        y: wd.map(d => d.sd),
        name: w,
        mode: "lines+markers",
        marker: { size: 5 }
      };
    });

    const layout = {
      title: "SD Over Time (" + site + ", " + cable + " ft)",
      xaxis: { title: "Date" },
      yaxis: { title: "Standard Deviation (counts)" },
      margin: { t: 50, b: 80, l: 60, r: 20 },
      legend: { font: { size: 10 } },
      paper_bgcolor: "transparent",
      plot_bgcolor: "#FFFFFF",
      font: { family: "IBM Plex Sans" }
    };

    Plotly.newPlot("plotSdTime", traces, layout, { responsive: true });
  }

  function renderCvTime(details, wellNames, site, cable) {
    const traces = wellNames.map(w => {
      const wd = details.filter(d => d.well === w).sort((a, b) => a.ym.localeCompare(b.ym));
      return {
        x: wd.map(d => d.ym + "-01"),
        y: wd.map(d => d.cv),
        name: w,
        mode: "lines+markers",
        marker: { size: 5 }
      };
    });

    const layout = {
      title: "CV Over Time (" + site + ", " + cable + " ft)",
      xaxis: { title: "Date" },
      yaxis: { title: "CV (%)" },
      margin: { t: 50, b: 80, l: 60, r: 20 },
      legend: { font: { size: 10 } },
      paper_bgcolor: "transparent",
      plot_bgcolor: "#FFFFFF",
      font: { family: "IBM Plex Sans" }
    };

    Plotly.newPlot("plotCvTime", traces, layout, { responsive: true });
  }

  function renderWellTable(wellStats) {
    const cols = ["Well", "Sessions", "Mean Count", "Mean SD", "Median SD", "Max SD", "Mean CV%", "Median CV%", "Max CV%"];
    let html = "<thead><tr>" + cols.map(c => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>";

    wellStats.forEach(w => {
      html += "<tr>";
      html += "<td>" + w.well + "</td>";
      html += "<td>" + w.sessions + "</td>";
      html += "<td>" + w.meanCount.toFixed(0) + "</td>";
      html += "<td>" + w.meanSD.toFixed(2) + "</td>";
      html += "<td>" + w.medianSD.toFixed(2) + "</td>";
      html += "<td>" + w.maxSD.toFixed(2) + "</td>";
      html += "<td>" + w.meanCV.toFixed(3) + "</td>";
      html += "<td>" + w.medianCV.toFixed(3) + "</td>";
      html += "<td>" + w.maxCV.toFixed(3) + "</td>";
      html += "</tr>";
    });

    html += "</tbody>";
    document.getElementById("wellTable").innerHTML = html;
  }

  function renderDetailTable(details) {
    const cols = ["Well", "Year-Month", "Readings", "Mean Count", "Std Dev", "CV%"];
    let html = "<thead><tr>" + cols.map(c => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>";

    details.forEach(d => {
      html += "<tr>";
      html += "<td>" + d.well + "</td>";
      html += "<td>" + d.ym + "</td>";
      html += "<td>" + d.n + "</td>";
      html += "<td>" + d.mean.toFixed(0) + "</td>";
      html += "<td>" + d.sd.toFixed(2) + "</td>";
      html += "<td>" + d.cv.toFixed(3) + "</td>";
      html += "</tr>";
    });

    html += "</tbody>";
    document.getElementById("detailTable").innerHTML = html;
  }

})();
