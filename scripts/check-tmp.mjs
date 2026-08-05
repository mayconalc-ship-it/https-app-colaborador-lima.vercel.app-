import ExcelJS from "exceljs";
const r = await fetch("https://drive.google.com/uc?export=download&id=1r58pECnrpsK1UwqQRVvcg6XhdVrAMfZg", { cache: "no-store" });
const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await r.arrayBuffer());
const L = []; wb.worksheets[0].eachRow({includeEmpty:false},(row)=>{const c=[];row.eachCell({includeEmpty:true},(cell,col)=>{c[col-1]=cell.value?.result??cell.value;});L.push(c);});
const H = L[1].map(h=>String(h??"").trim());
const num=(v)=>{if(v==null)return null;const s=String(v).replace(/R\$/gi,"").replace(/\s/g,"");const t=s.includes(",")?s.replace(/\./g,"").replace(",","."):s;const n=Number(t);return Number.isFinite(n)?n:null;};
const c=(n)=>H.indexOf(n);
const iF=c("Função"), iCx=c("Qt Caixas"), iSem=c("RV s/ %"), iCom=c("RV  com  %"), iRec=c("Valor Rec"), iQR=c("Qt. Rec."), iTT=c("TT-Devolução");
const porFuncao = {};
for (const l of L.slice(2)) {
  const f=l[iF], cx=num(l[iCx]), sem=num(l[iSem]);
  if(!f||!cx||!sem) continue;
  const taxa=+(sem/cx).toFixed(4);
  (porFuncao[f] ??= new Set()).add(taxa);
}
console.log("taxa por caixa, por função:");
for (const [f,s] of Object.entries(porFuncao)) console.log(" ", f, "->", [...s].join(", "));
// conferir a escada em 3 linhas
for (const l of [L[2], L[4], L.slice(2).find(x=>String(x[iF]).includes("judante"))]) {
  if(!l) continue;
  const cx=num(l[iCx]),sem=num(l[iSem]),com=num(l[iCom]),rec=num(l[iRec]),tt=num(l[iTT]);
  console.log(`\n${l[5]} (${l[iF]})`);
  console.log("  caixas", cx, "x taxa", cx?+(sem/cx).toFixed(4):null, "=", sem);
  console.log("  sem*1.05 =", sem?+(sem*1.05).toFixed(2):null, " planilha RV com% =", com);
  console.log("  com+rec  =", (com??0)+(rec??0), " planilha TT-Dev =", tt, " (Qt Rec =", l[iQR], ")");
}
