import {startPreview} from './quick-look.mjs';
import {WorkbookModel,columnName} from './model.mjs';

await startPreview({render:async({ink,file,root})=>{
 const meta=JSON.parse(file.body),state=await ink.state.open(meta.documentKey,{namespace:file.namespace});
 let selected;
 const paint=()=>{
  const model=new WorkbookModel(state.entries());selected=model.sheets.find(sheet=>sheet.id===selected)?.id||model.sheets[0]?.id;
  root.replaceChildren();const title=document.createElement('h2');title.textContent=file.title;root.append(title);
  for(const sheet of model.sheets){const button=document.createElement('button');button.textContent=sheet.name;button.setAttribute('aria-pressed',String(sheet.id===selected));button.onclick=()=>{selected=sheet.id;paint();};root.append(button);}
  if(!selected){const empty=document.createElement('p');empty.textContent='This workbook has no sheets.';root.append(empty);return;}
  let lastRow=-1,lastColumn=-1;const prefix='/cells/'+selected+'/';
  for(const[path,value]of model.values)if(path.startsWith(prefix)&&value!==''){const[row,column]=path.slice(prefix.length).split(':').map(Number);lastRow=Math.max(lastRow,row);lastColumn=Math.max(lastColumn,column);}
  const table=document.createElement('table'),header=document.createElement('tr');header.append(document.createElement('th'));
  const rows=Math.min(200,Math.max(1,lastRow+1)),columns=Math.min(30,Math.max(1,lastColumn+1));
  for(let column=0;column<columns;column++){const cell=document.createElement('th');cell.textContent=columnName(column);header.append(cell);}table.append(header);
  for(let row=0;row<rows;row++){const line=document.createElement('tr'),number=document.createElement('th');number.textContent=String(row+1);line.append(number);for(let column=0;column<columns;column++){const cell=document.createElement('td');cell.textContent=String(model.display(selected,row,column));line.append(cell);}table.append(line);}root.append(table);
  if(lastRow>=200||lastColumn>=30){const note=document.createElement('p');note.textContent='Showing the first 200 rows and 30 columns. Open the workbook to see everything.';root.append(note);}
 };
 const stop=state.subscribe(paint);paint();return()=>{stop();void state.close();};
}});
