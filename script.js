// script.js
(function () {
  "use strict";

  var syncEl        = document.getElementById("syncStatus");
  var siteSelect    = document.getElementById("siteSelect");
  var cableLenInput = document.getElementById("cableLenInput");
  var startMonthSel = document.getElementById("startMonth");
  var startYearSel  = document.getElementById("startYear");
  var endMonthSel   = document.getElementById("endMonth");
  var endYearSel    = document.getElementById("endYear");
  var wellChecksDiv = document.getElementById("wellChecks");
  var selectAllBtn  = document.getElementById("selectAllWellsBtn");
  var clearWellsBtn = document.getElementById("clearWellsBtn");
  var analyzeBtn    = document.getElementById("analyzeBtn");
  var statusNote    = document.getElementById("statusNote");
  var summaryCards  = document.getElementById("summaryCards");

  var rawRows = [];
  var colMap  = {};

  var monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function toNum(v) {
    if (v === undefined || v === null || v === "") return NaN;
    return Number(v);
  }

  function std(arr) {
    var n = arr.length;
    if (n < 2) return 0;
    var m = mean(arr);
    var ss = 0;
    for (var i = 0; i < n; i++) ss += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(ss / (n - 1));
  }

  function mean(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function populateMonthSelect(sel, defaultVal) {
    sel.innerHTML = "";
    for (var i = 1; i <= 12; i++) {
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = monthNames[i - 1];
      if (i === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function populateYearSelect(sel, years, defaultVal) {
    sel.innerHTML = "";
    for (var i = 0; i < years.length; i++) {
      var opt = document.createElement("option");
      opt.value = years[i];
      opt.textContent = years[i];
      if (years[i] === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function unique(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = true; out.push(arr[i]); }
    }
    return out;
  }

  function numericSort(a, b) {
    var na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /* ---- tabs ---- */
  var tabs = document.querySelectorAll(".tab");
  for (var t = 0; t < tabs.length; t++) {
    (function (tab) {
      tab.addEventListener("click", function () {
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove("active");
        var contents = document.querySelectorAll(".tabContent");
        for (var j = 0; j < contents.length; j++) contents[j].classList.remove("active");
        tab.classList.add("active");
        document.getElementById("tab-" + tab.getAttribute("data-tab")).classList.add("active");
        window.dispatchEvent(new Event("resize"));
      });
    })(tabs[t]);
  }

  /* ---- load CSV ---- */
  Papa.parse(defined_csv, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      rawRows = results.data;
      var headers = results.meta.fields;

      colMap.site    = findCol(headers, "site");
      colMap.hole    = findCol(headers, "hole");
      colMap.date    = findCol(headers, "date");
      colMap.cable   = findCol(headers, "cable");
      colMap.neutron = findCol(headers, "neutron");

      if (!colMap.site || !colMap.hole || !colMap.date || !colMap.cable || !colMap.neutron) {
        syncEl.textContent = "Error: could not find required columns.";
        return;
      }

      // Set hidden site select (kept for future use)
      var sites = unique(rawRows.map(function (r) { return (r[colMap.site] || "").trim(); }).filter(Boolean)).sort();
      siteSelect.innerHTML = "";
      for (var i = 0; i < sites.length; i++) {
        var opt = document.createElement("option");
        opt.value = sites[i];
        opt.textContent = sites[i];
        if (sites[i].toLowerCase() === default_site.toLowerCase()) opt.selected = true;
        siteSelect.appendChild(opt);
      }

      // Set hidden cable length
      cableLenInput.value = default_cable;

      // Years
      var allYears = unique(rawRows.map(function (r) {
        var d = r[colMap.date];
        if (!d) return null;
        var y = parseInt(d.substring(0, 4));
        return isNaN(y) ? null : y;
      }).filter(function (v) { return v !== null; })).sort();

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

  function findCol(headers, keyword) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].toLowerCase().indexOf(keyword) !== -1) return headers[i];
    }
    return "";
  }

  /* ---- well checkboxes ---- */
  function updateWellList() {
    var site = siteSelect.value || default_site;
    var wells = unique(
      rawRows
        .filter(function (r) { return (r[colMap.site] || "").trim().toLowerCase() === site.toLowerCase(); })
        .map(function (r) { return (r[colMap.hole] || "").trim(); })
        .filter(Boolean)
    ).sort(numericSort);

    var isRivendell = site.toLowerCase() === "rivendell";

    wellChecksDiv.innerHTML = "";
    for (var i = 0; i < wells.length; i++) {
      var lbl = document.createElement("label");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = wells[i];

      if (isRivendell) {
        cb.checked = default_wells_rivendell.indexOf(wells[i]) !== -1;
      } else {
        cb.checked = true;
      }

      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(" " + wells[i]));
      wellChecksDiv.appendChild(lbl);
    }
  }

  selectAllBtn.addEventListener("click", function () {
    var cbs = wellChecksDiv.querySelectorAll("input");
    for (var i = 0; i < cbs.length; i++) cbs[i].checked = true;
  });

  clearWellsBtn.addEventListener("click", function () {
    var cbs = wellChecksDiv.querySelectorAll("input");
    for (var i = 0; i < cbs.length; i++) cbs[i].checked = false;
  });

  /* ---- analyze ---- */
  analyzeBtn.addEventListener("click", runAnalysis);

  function runAnalysis() {
    statusNote.textContent = "";
    statusNote.classList.remove("error");

    var site = siteSelect.value || default_site;
    var cableLen = toNum(cableLenInput.value || default_cable);
    var sY = parseInt(startYearSel.value);
    var sM = parseInt(startMonthSel.value);
    var eY = parseInt(endYearSel.value);
    var eM = parseInt(endMonthSel.value);

    var selectedWells = {};
    var cbs = wellChecksDiv.querySelectorAll("input:checked");
    for (var i = 0; i < cbs.length; i++) selectedWells[cbs[i].value] = true;

    if (Object.keys(selectedWells).length === 0) {
      statusNote.textContent = "Select at least one well.";
      statusNote.classList.add("error");
      return;
    }

    var startDate = new Date(sY, sM - 1, 1);
    var endDate = new Date(eY, eM, 0);

    var filtered = rawRows.filter(function (r) {
      if ((r[colMap.site] || "").trim().toLowerCase() !== site.toLowerCase()) return false;
      var cable = toNum(r[colMap.cable]);
      if (cable !== cableLen) return false;
      var hole = (r[colMap.hole] || "").trim();
      if (!selectedWells[hole]) return false;
      var d = new Date(r[colMap.date]);
      if (isNaN(d.getTime())) return false;
      if (d < startDate || d > endDate) return false;
      var nc = toNum(r[colMap.neutron]);
      if (isNaN(nc)) return false;
      return true;
    });

    if (filtered.length === 0) {
      statusNote.textContent = "No data found for these filters.";
      statusNote.classList.add("error");
      return;
    }

    var groups = {};
    for (var i = 0; i < filtered.length; i++) {
      var r = filtered[i];
      var hole = (r[colMap.hole] || "").trim();
      var d = new Date(r[colMap.date]);
      var ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      var key = hole + "_" + ym;
      if (!groups[key]) groups[key] = { well: hole, ym: ym, counts: [] };
      groups[key].counts.push(toNum(r[colMap.neutron]));
    }

    var details = [];
    var warnings = [];
    var keys = Object.keys(groups);

    for (var i = 0; i < keys.length; i++) {
      var g = groups[keys[i]];
      var c = g.counts.filter(function (v) { return !isNaN(v); });
      var n = c.length;

      if (n < 2) {
        warnings.push("SKIPPED: \"" + g.well + " " + g.ym + "\" has only " + n + " measurement(s)");
        continue;
      }
      if (n !== 3) {
        warnings.push("WARNING: \"" + g.well + " " + g.ym + "\" has " + n + " measurements (expected 3)");
      }

      details.push({
        well: g.well,
        ym: g.ym,
        n: n,
        mean: mean(c),
        sd: std(c)
      });
    }

    if (details.length === 0) {
      statusNote.textContent = "No valid triplet groups found.";
      statusNote.classList.add("error");
      return;
    }

    details.sort(function (a, b) {
      var wc = numericSort(a.well, b.well);
      return wc !== 0 ? wc : a.ym.localeCompare(b.ym);
    });

    var allSD = details.map(function (d) { return d.sd; });

    var overall = {
      sessions: details.length,
      meanSD: mean(allSD),
      medianSD: median(allSD),
      minSD: Math.min.apply(null, allSD),
      maxSD: Math.max.apply(null, allSD)
    };

    var wellNames = unique(details.map(function (d) { return d.well; })).sort(numericSort);

    var wellStats = wellNames.map(function (w) {
      var wd = details.filter(function (d) { return d.well === w; });
      var sds = wd.map(function (d) { return d.sd; });
      var means = wd.map(function (d) { return d.mean; });
      return {
        well: w,
        sessions: wd.length,
        meanCount: mean(means),
        meanSD: mean(sds),
        medianSD: median(sds),
        maxSD: Math.max.apply(null, sds)
      };
    });

    renderSummary(overall, warnings, site, cableLen, sY, sM, eY, eM);
    renderSdBox(details, wellNames, site, cableLen);
    renderSdTime(details, wellNames, site, cableLen);
    renderWellTable(wellStats);
    renderDetailTable(details);

    statusNote.textContent = details.length + " sessions analyzed across " + wellNames.length + " wells.";
  }

  /* ---- renderers ---- */

  function renderSummary(o, warnings, site, cable, sY, sM, eY, eM) {
    var range = monthNames[sM - 1] + " " + sY + " \u2013 " + monthNames[eM - 1] + " " + eY;

    var html = "";

    html += '<div class="card full"><h3>Analysis</h3>';
    html += met("Site", site);
    html += met("Cable length", cable + " ft");
    html += met("Date range", range);
    html += met("Sessions", o.sessions);
    html += "</div>";

    html += '<div class="card full"><h3>Standard Deviation</h3>';
    html += met("Mean", o.meanSD.toFixed(2) + " counts");
    html += met("Median", o.medianSD.toFixed(2) + " counts");
    html += met("Min", o.minSD.toFixed(2) + " counts");
    html += met("Max", o.maxSD.toFixed(2) + " counts");
    html += "</div>";

    if (warnings.length > 0) {
      html += '<div class="card full" id="warningCard"><h3>Warnings</h3>';
      html += '<div class="warnings" id="warningsBox">';
      html += '<button class="warnings__close" id="closeWarningsBtn" aria-label="Close">&times;</button>';
      for (var i = 0; i < warnings.length; i++) {
        html += "<p>" + warnings[i] + "</p>";
      }
      html += "</div></div>";
    }

    summaryCards.innerHTML = html;

    // Attach close button listener
    var closeBtn = document.getElementById("closeWarningsBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        var card = document.getElementById("warningCard");
        if (card) card.style.display = "none";
      });
    }
  }

  function met(label, value) {
    return '<div class="metric"><span class="label">' + label + ':</span> <span class="value">' + value + "</span></div>";
  }

  function renderSdBox(details, wellNames, site, cable) {
    var traces = wellNames.map(function (w) {
      return {
        y: details.filter(function (d) { return d.well === w; }).map(function (d) { return d.sd; }),
        name: w,
        type: "box",
        boxpoints: "outliers"
      };
    });

    var layout = {
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
    var traces = wellNames.map(function (w) {
      var wd = details.filter(function (d) { return d.well === w; }).sort(function (a, b) { return a.ym.localeCompare(b.ym); });
      return {
        x: wd.map(function (d) { return d.ym + "-01"; }),
        y: wd.map(function (d) { return d.sd; }),
        name: w,
        mode: "lines+markers",
        marker: { size: 5 }
      };
    });

    var layout = {
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

  function renderWellTable(wellStats) {
    var cols = ["Well", "Sessions", "Mean Count", "Mean SD", "Median SD", "Max SD"];
    var html = "<thead><tr>";
    for (var i = 0; i < cols.length; i++) html += "<th>" + cols[i] + "</th>";
    html += "</tr></thead><tbody>";

    for (var i = 0; i < wellStats.length; i++) {
      var w = wellStats[i];
      html += "<tr>";
      html += "<td>" + w.well + "</td>";
      html += "<td>" + w.sessions + "</td>";
      html += "<td>" + w.meanCount.toFixed(0) + "</td>";
      html += "<td>" + w.meanSD.toFixed(2) + "</td>";
      html += "<td>" + w.medianSD.toFixed(2) + "</td>";
      html += "<td>" + w.maxSD.toFixed(2) + "</td>";
      html += "</tr>";
    }

    html += "</tbody>";
    document.getElementById("wellTable").innerHTML = html;
  }

  function renderDetailTable(details) {
    var cols = ["Well", "Year-Month", "Readings", "Mean Count", "Std Dev"];
    var html = "<thead><tr>";
    for (var i = 0; i < cols.length; i++) html += "<th>" + cols[i] + "</th>";
    html += "</tr></thead><tbody>";

    for (var i = 0; i < details.length; i++) {
      var d = details[i];
      html += "<tr>";
      html += "<td>" + d.well + "</td>";
      html += "<td>" + d.ym + "</td>";
      html += "<td>" + d.n + "</td>";
      html += "<td>" + d.mean.toFixed(0) + "</td>";
      html += "<td>" + d.sd.toFixed(2) + "</td>";
      html += "</tr>";
    }

    html += "</tbody>";
    document.getElementById("detailTable").innerHTML = html;
  }

})();
