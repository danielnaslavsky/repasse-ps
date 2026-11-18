/**
 * repasse · sincronização do cronograma do PS com o Google Sheets (e, se quiser, com o Google Agenda).
 *
 * Como instalar (5 minutos):
 *  1. Crie uma planilha no Google Sheets (ex.: "Cronograma do PS").
 *  2. Menu Extensões → Apps Script. Apague o que estiver lá e cole este arquivo inteiro.
 *  3. Troque o TOKEN abaixo por um código seu (o mesmo vai na Vercel, em GOOGLE_SCRIPT_TOKEN).
 *  4. Opcional: cole em CALENDARIO_ID o ID de um Google Agenda (Configurações da agenda → "ID da agenda").
 *  5. Engrenagem (Configurações do projeto) → fuso horário "America/Sao_Paulo" ou "America/Recife".
 *  6. Implantar → Nova implantação → tipo "App da Web". Executar como: "Eu". Quem pode acessar: "Qualquer pessoa".
 *     Autorize o acesso quando o Google pedir.
 *  7. Copie a URL do app da Web e cole na Vercel em GOOGLE_SCRIPT_URL. Redeploy.
 *  8. Compartilhe a planilha com os aspirantes como "Leitor".
 */

const TOKEN = "troque-este-codigo";
const CALENDARIO_ID = ""; // opcional

const MARCA = "[repasse]";
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const VERDE = "#0e5a47";

function doPost(e) {
  try {
    const corpo = JSON.parse(e.postData.contents);
    if (corpo.token !== TOKEN) return resposta({ ok: false, erro: "token inválido" });
    const eventos = (corpo.eventos || []).filter(function (ev) { return ev && ev.data; });
    eventos.sort(function (a, b) { return (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")); });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    escreverLista(ss, eventos);
    escreverCalendario(ss, eventos);
    let agenda = "não configurada";
    if (CALENDARIO_ID) agenda = sincronizarAgenda(eventos);
    return resposta({ ok: true, itens: eventos.length, agenda: agenda, em: new Date().toISOString() });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  }
}

function doGet() {
  return resposta({ ok: true, servico: "repasse · cronograma do PS" });
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function aba(ss, nome) {
  return ss.getSheetByName(nome) || ss.insertSheet(nome);
}

function paraData(iso, hora) {
  const p = iso.split("-").map(Number);
  const h = hora ? hora.split(":").map(Number) : [0, 0];
  return new Date(p[0], p[1] - 1, p[2], h[0], h[1]);
}

function rotuloData(iso) {
  const d = paraData(iso);
  const nomes = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return nomes[d.getDay()] + ", " + iso.slice(8, 10) + "/" + iso.slice(5, 7);
}

function horaBR(hora) {
  if (!hora) return "";
  const p = hora.split(":");
  return p[1] === "00" ? Number(p[0]) + "h" : Number(p[0]) + "h" + p[1];
}

// ---------- Aba "Cronograma": uma linha por item ----------
function escreverLista(ss, eventos) {
  const sh = aba(ss, "Cronograma");
  sh.clear();
  const cab = ["Data", "Horário", "Tipo", "Subárea", "Item", "Entrega", "Local"];
  const linhas = eventos.map(function (ev) {
    return [rotuloData(ev.data), horaBR(ev.hora), ev.tipoRotulo || ev.tipo, ev.area || "", ev.titulo || "", ev.entrega ? rotuloData(ev.entrega) : "", ev.local || ""];
  });
  sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight("bold").setFontColor("#ffffff").setBackground(VERDE);
  if (linhas.length) sh.getRange(2, 1, linhas.length, cab.length).setValues(linhas);
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, 1, 110);
  sh.setColumnWidths(2, 1, 80);
  sh.setColumnWidths(3, 2, 150);
  sh.setColumnWidths(5, 1, 300);
  sh.setColumnWidths(6, 1, 110);
  sh.setColumnWidths(7, 1, 240);
  const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  eventos.forEach(function (ev, i) {
    if ((ev.entrega || ev.data) < hoje) sh.getRange(i + 2, 1, 1, cab.length).setFontColor("#9a978f");
  });
  sh.getRange(linhas.length + 3, 1).setValue("Atualizado automaticamente pelo repasse em " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm")).setFontColor("#9a978f").setFontStyle("italic");
}

// ---------- Aba "Calendário": grade mensal ----------
function itensDoDia(eventos, iso) {
  const itens = [];
  eventos.forEach(function (ev) {
    if (ev.tipo === "desafio") {
      if (ev.data === iso) itens.push("Lança · " + (ev.area || ev.titulo));
      if (ev.entrega === iso) itens.push("Entrega · " + (ev.area || ev.titulo));
    } else if (ev.data === iso) {
      itens.push((ev.hora ? horaBR(ev.hora) + " " : "") + (ev.tipo === "treinamento" ? "Treino · " + (ev.area || "") : ev.titulo));
    }
  });
  return itens;
}

function escreverCalendario(ss, eventos) {
  const sh = aba(ss, "Calendário");
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  if (!eventos.length) {
    sh.getRange(1, 1).setValue("Nenhum item no cronograma.");
    return;
  }
  const datas = [];
  eventos.forEach(function (ev) { datas.push(ev.data); if (ev.entrega) datas.push(ev.entrega); });
  datas.sort();
  const ini = paraData(datas[0]);
  const fim = paraData(datas[datas.length - 1]);
  sh.setColumnWidths(1, 7, 150);
  let linha = 1;
  let ano = ini.getFullYear();
  let mes = ini.getMonth();
  while (ano < fim.getFullYear() || (ano === fim.getFullYear() && mes <= fim.getMonth())) {
    sh.getRange(linha, 1, 1, 7).merge().setValue(MESES[mes] + " " + ano).setFontWeight("bold").setFontSize(14);
    linha++;
    sh.getRange(linha, 1, 1, 7).setValues([DIAS]).setFontWeight("bold").setFontColor("#ffffff").setBackground(VERDE).setHorizontalAlignment("center");
    linha++;
    const primeiro = new Date(ano, mes, 1);
    let cursor = new Date(ano, mes, 1 - ((primeiro.getDay() + 6) % 7));
    for (let s = 0; s < 6; s++) {
      const valores = [];
      const fundos = [];
      for (let d = 0; d < 7; d++) {
        const iso = Utilities.formatDate(cursor, Session.getScriptTimeZone(), "yyyy-MM-dd");
        const doMes = cursor.getMonth() === mes;
        const itens = doMes ? itensDoDia(eventos, iso) : [];
        valores.push(doMes ? [String(cursor.getDate())].concat(itens).join("\n") : "");
        fundos.push(itens.length ? "#e3efe9" : doMes ? "#ffffff" : "#f4f2ed");
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      }
      const faixa = sh.getRange(linha, 1, 1, 7);
      faixa.setValues([valores]).setBackgrounds([fundos]).setVerticalAlignment("top").setWrap(true).setFontSize(9);
      faixa.setBorder(true, true, true, true, true, true, "#e3dfd5", SpreadsheetApp.BorderStyle.SOLID);
      sh.setRowHeight(linha, 80);
      linha++;
      if (cursor.getMonth() !== mes && s >= 3) break;
    }
    linha++;
    mes++;
    if (mes > 11) { mes = 0; ano++; }
  }
}

// ---------- Google Agenda (opcional) ----------
function sincronizarAgenda(eventos) {
  const cal = CalendarApp.getCalendarById(CALENDARIO_ID);
  if (!cal) return "agenda não encontrada";
  const datas = [];
  eventos.forEach(function (ev) { datas.push(ev.data); if (ev.entrega) datas.push(ev.entrega); });
  datas.sort();
  const ini = paraData(datas[0]);
  ini.setDate(ini.getDate() - 30);
  const fim = paraData(datas[datas.length - 1]);
  fim.setDate(fim.getDate() + 60);
  cal.getEvents(ini, fim).forEach(function (e) {
    if ((e.getDescription() || "").indexOf(MARCA) >= 0) e.deleteEvent();
  });
  let n = 0;
  eventos.forEach(function (ev) {
    const desc = (ev.descricao ? ev.descricao + "\n\n" : "") + MARCA;
    const opts = { location: ev.local || "", description: desc };
    if (ev.tipo === "desafio") {
      cal.createAllDayEvent("Lançamento: " + ev.titulo, paraData(ev.data), opts);
      n++;
      if (ev.entrega) { cal.createAllDayEvent("Entrega: " + ev.titulo, paraData(ev.entrega), opts); n++; }
    } else if (ev.hora) {
      const inicio = paraData(ev.data, ev.hora);
      cal.createEvent(ev.titulo, inicio, new Date(inicio.getTime() + 90 * 60000), opts);
      n++;
    } else {
      cal.createAllDayEvent(ev.titulo, paraData(ev.data), opts);
      n++;
    }
  });
  return n + " eventos";
}
