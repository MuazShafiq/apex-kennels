import {PDFDocument,rgb,StandardFonts,type PDFPage,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {clean,layoutCanvaItems,rawFontAttachment,validatePayablePdf,validatePdfQuote} from './canva-invoice-pdf.ts';
import {validateSnapshot,type ReviewSnapshot} from './staff-saved-review.ts';
import type {ApprovalSnapshot} from './invoice-approval.ts';

const width=595.28,height=841.89,margin=42,right=width-margin;
const raven=rgb(.07,.027,.035),powder=rgb(.75,.89,.96),mist=rgb(.93,.96,.98);
const coral=rgb(.99,.43,.43),red=rgb(.62,.07,.17),white=rgb(1,1,1);
const money=(n:number)=>n.toLocaleString('en-PK');
const invoiceDate=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const formatDate=(date:string)=>invoiceDate.format(new Date(date+'T00:00:00Z'));

// Approved export: assets/44080e3504025c9d881868f804cf517e.svg.
const dogPath='M86 5 L86 7 L85 8 L85 35 L71 63 L71 65 L69 68 L69 70 L65 80 L65 83 L64 84 L64 87 L63 88 L63 91 L62 95 L61 96 L61 99 L59 104 L58 114 L56 119 L56 126 L55 127 L54 133 L51 138 L51 140 L45 150 L38 157 L37 159 L37 164 L38 165 L39 170 L42 175 L42 177 L44 180 L49 196 L52 199 L57 201 L67 200 L70 194 L69 187 L62 179 L62 178 L55 171 L52 165 L54 162 L58 161 L60 159 L67 158 L68 157 L65 150 L67 149 L74 156 L80 165 L85 176 L85 178 L87 182 L87 204 L83 209 L74 211 L73 213 L67 218 L25 219 L18 222 L7 233 L7 237 L8 238 L10 238 L11 239 L16 239 L17 240 L53 240 L55 243 L52 245 L50 245 L49 244 L20 244 L19 245 L13 245 L8 247 L5 250 L1 257 L1 270 L4 274 L324 274 L325 273 L327 273 L327 270 L323 268 L319 268 L318 267 L309 267 L308 266 L303 266 L302 265 L297 265 L296 264 L289 264 L288 263 L281 263 L280 262 L272 262 L271 261 L266 261 L265 260 L263 260 L260 257 L260 254 L262 249 L262 245 L263 244 L264 237 L266 234 L266 230 L268 226 L268 219 L267 217 L245 195 L245 194 L235 184 L234 182 L235 180 L239 180 L240 181 L252 180 L258 177 L260 177 L269 172 L277 166 L287 156 L291 150 L292 145 L290 145 L286 148 L279 150 L270 155 L268 155 L255 160 L247 161 L246 162 L231 162 L230 161 L228 161 L224 158 L215 145 L207 137 L192 129 L190 129 L187 127 L185 127 L172 121 L161 118 L155 115 L152 112 L149 111 L140 105 L128 94 L123 87 L122 82 L121 81 L121 74 L122 73 L122 70 L127 64 L131 62 L142 60 L151 56 L159 47 L159 34 L154 32 L136 32 L135 31 L133 31 L124 23 L115 22 L111 20 L106 15 L105 10 L104 9 L104 5 L103 4 L103 2 L101 0 L98 6 L96 8 L93 8 L90 5 Z M191 201 L193 199 L195 201 L198 208 L204 214 L214 220 L220 221 L221 222 L226 222 L227 223 L241 223 L243 224 L249 231 L249 236 L250 237 L250 239 L249 240 L249 244 L248 246 L234 256 L232 256 L229 258 L223 259 L222 260 L212 260 L210 257 L206 254 L192 254 L191 255 L181 255 L180 256 L178 256 L176 254 L177 250 L190 237 L191 237 L196 231 L196 218 L195 217 L195 212 L194 211 L194 209 L191 204 Z M108 167 L110 169 L112 174 L117 176 L163 177 L164 178 L166 178 L169 181 L169 183 L168 184 L158 184 L157 183 L144 182 L144 188 L148 198 L160 210 L171 216 L177 223 L177 228 L174 234 L169 240 L163 243 L152 244 L149 247 L148 251 L145 254 L139 254 L138 253 L133 252 L130 250 L128 250 L122 244 L121 237 L119 234 L112 231 L102 229 L98 226 L98 220 L99 219 L101 211 L103 208 L103 206 L106 199 L106 196 L107 195 L107 168 Z';

export function renderBrandedStaffPdf(review:ReviewSnapshot,date:string,fontSource:Uint8Array):Promise<Uint8Array>{
  return renderInvoice(review,date,fontSource);
}
export function renderBrandedApprovedPdf(approval:ApprovalSnapshot,fontSource:Uint8Array):Promise<Uint8Array>{
  validatePayablePdf(approval);
  return renderInvoice(approval.review,approval.approvedAt.slice(0,10),fontSource,approval);
}

async function renderInvoice(input:ReviewSnapshot,date:string,fontSource:Uint8Array,approval?:ApprovalSnapshot):Promise<Uint8Array>{
  const review=validateSnapshot(input);
  const q=review.quote,b=review.booking;
  validatePdfQuote(q,!!review.ownerOverride);
  const source=await PDFDocument.load(fontSource);
  const pdf=await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular=await pdf.embedFont(rawFontAttachment(source,'Inter-Regular-Subset'),{subset:false});
  const bold=await pdf.embedFont(rawFontAttachment(source,'Inter-Bold-Subset'),{subset:false});
  const referenceFont=await pdf.embedFont(StandardFonts.CourierBold);
  const headerArt=await pdf.embedPage(source.getPage(0));
  const rows=layoutCanvaItems(q,regular).flat();
  let page:PDFPage;
  let cursor=0;
  const rect=(x:number,top:number,w:number,h:number,color:ReturnType<typeof rgb>)=>
    page.drawRectangle({x,y:height-top-h,width:w,height:h,color});
  const text=(value:string,x:number,top:number,size=11,font:PDFFont=regular,color=raven)=>
    page.drawText(value,{x,y:height-top,size,font,color});
  const fitted=(value:string,x:number,top:number,maxWidth:number,font=bold,alignRight=false)=>{
    const size=[11,10,9,8,7].find(s=>font.widthOfTextAtSize(value,s)<=maxWidth);
    if(!size)throw new Error('Invoice field exceeds available width');
    text(value,alignRight?x-font.widthOfTextAtSize(value,size):x,top,size,font);
  };
  const block=(label:string,value:string,x:number,top:number,maxWidth:number):number=>{
    text(label,x,top,8,bold);
    const lines:string[]=[];
    let line='';
    for(const ch of clean(value)){
      if(line&&bold.widthOfTextAtSize(line+ch,11)>maxWidth){
        const split=line.lastIndexOf(' ');
        if(split>0){lines.push(line.slice(0,split));line=line.slice(split+1);}
        else {lines.push(line);line='';}
      }
      line+=ch;
    }
    if(line.trim())lines.push(line.trim());
    lines.forEach((line,index)=>text(line,x,top+16+index*14,11,bold));
    return top+20+lines.length*14;
  };
  const number=approval?.invoiceNumber??'REVIEW-'+b.id.slice(0,8).toUpperCase();
  const newPage=(first:boolean)=>{
    page=pdf.addPage([width,height]);
    const header=first?140:85;
    rect(0,0,width,header,raven);
    if(first)page.drawPage(headerArt,{x:0,y:height-header,width,height:header});
    rect(margin,header-3,42,3,coral);
    rect(margin,24,30,38,powder);
    page.drawSvgPath(dogPath,{x:margin+3,y:height-33,scale:.073,color:raven});
    text('APEX',margin+40,43,23,bold,white);
    text('KENNELS',margin+41,58,9,bold,coral);
    page.drawSvgPath(dogPath,{x:right-141,y:height-(first?20:8),scale:first?.43:.27,color:coral});
    page.drawSvgPath(dogPath,{x:right-143,y:height-(first?22:10),scale:first?.43:.27,color:rgb(.02,.01,.014)});
    if(first)text('DOG BOARDING',margin,108,9,bold,powder);
    cursor=header+42;
    text('Invoice',margin,cursor,first?40:24,bold);
    const titleTop=cursor;
    if(first){
      const meta=cursor-15;
      const billedTo=block('BILLED TO',b.customerName,285,meta,143);
      const dated=block('DATE',formatDate(date),445,meta,108);
      cursor=block('DOGS',b.petNames,285,Math.max(billedTo,dated),268);
      if(b.petBreeds)cursor=block('BREED',b.petBreeds,285,cursor,268);
    }
    const status=approval?'ISSUED':'REVIEW COPY';
    const reference=approval?'NO. '+number:number;
    const pillTop=titleTop+21;
    const pillWidth=(value:string)=>bold.widthOfTextAtSize(value,8)+16;
    rect(margin,pillTop-11,pillWidth(status),17,coral);
    text(status,margin+8,pillTop,8,bold);
    const referenceX=margin+pillWidth(status)+7;
    rect(referenceX,pillTop-11,referenceFont.widthOfTextAtSize(reference,8)+16,17,mist);
    text(reference,referenceX+8,pillTop,8,referenceFont,red);
    if(!approval){
      text(b.synthetic?'NOT PAYABLE · SYNTHETIC EXAMPLE':'NOT PAYABLE',margin,pillTop+19,8,bold,red);
    }
    cursor=Math.max(cursor,pillTop+(approval?22:34));
    if(first){
      rect(margin,cursor,right-margin,54,mist);
      text('BOARDING PERIOD',margin+12,cursor+14,8,bold);
      text(formatDate(b.startDate)+' - '+formatDate(b.endDate),margin+12,cursor+34,16,bold);
      fitted(String(q.billedDays)+' billed days',right-12,cursor+34,130,bold,true);
      rect(margin+12,cursor+44,right-margin-24,1,coral);
      cursor+=75;
    }
    for(const [label,x] of [['#',margin],['SERVICE',margin+24],['QUANTITY',299],['RATE',398],['AMOUNT',493]] as const)
      text(label,x,cursor,8,bold);
    rect(margin,cursor+7,right-margin,1,raven);
    cursor+=22;
  };
  newPage(true);
  for(const [index,row] of rows.entries()){
    if(cursor+row.height>height-155)newPage(false);
    text(String(index+1).padStart(2,'0'),margin,cursor,9);
    row.description.forEach((line,i)=>text(line,margin+24,cursor+13*i,10));
    fitted(row.quantity,344,cursor,61,regular,true);
    fitted(row.unitPrice,447,cursor,92,regular,true);
    fitted(row.amount,right,cursor,96,bold,true);
    cursor+=row.height;
  }
  if(cursor+128>height-42)newPage(false);
  const totalsTop=Math.max(cursor+10,height-183);
  rect(margin,totalsTop,right-margin,1,powder);
  if(approval){
    let paymentTop=totalsTop+19;
    paymentTop=block('PAYMENT Â· HBL',approval.payment.accountTitle,margin,paymentTop,255);
    text('Account '+approval.payment.accountNumber,margin,paymentTop,10);
    text('IBAN '+approval.payment.iban,margin,paymentTop+16,10);
  }else {
    text('Internal estimate for staff review.',margin,totalsTop+23,10);
  }
  const discount=q.subtotalPkr-q.totalPkr;
  text('Subtotal',342,totalsTop+22);
  fitted(money(q.subtotalPkr),right,totalsTop+22,136,bold,true);
  if(discount){text('Discount',342,totalsTop+42);fitted('-'+money(discount),right,totalsTop+42,136,bold,true);}
  rect(331,totalsTop+52,right-331,40,powder);
  text('TOTAL PKR',342,totalsTop+77,9,bold);
  fitted(money(q.totalPkr),right-9,totalsTop+77,128,bold,true);
  const pages=pdf.getPages();
  pages.forEach((target,index)=>{
    target.drawRectangle({x:0,y:0,width,height:25,color:raven});
    target.drawText('APEX KENNELS  /  '+String(index+1)+' OF '+String(pages.length),{x:margin,y:9,font:bold,size:8,color:white});
  });
  pdf.setTitle(approval?'Apex Kennels | Invoice '+number:b.synthetic?'Apex Kennels | Synthetic preview':'Apex Kennels | Review copy');
  pdf.setSubject(approval?'Issued invoice':'Internal review, not an issued invoice');
  return pdf.save();
}
