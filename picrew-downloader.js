/* Picrew downloader bookmarklet version 1.2
you can just paste it in your browser console

https://pkware.cachefly.net/webdocs/APPNOTE/APPNOTE_6.2.0.txt
just set the ZIP date field to 00000000 and not care
don't compress anything, just store it. the only file that was compressed in the previous version was stack.xml anyway.

zip64? nah we're keeping things fittable in two SD cards
*/
//setInt32 and setInt16, for positive numbers, function identically to setUint32 and setUint16
if (location.hostname!='picrew.me'||!(location.pathname.startsWith('/image_maker/')||location.pathname.startsWith('/secret_image_maker/'))) alert('Not a Picrew image maker!');
else void(async downloadCurrentState=>{

const progressBar=document.createElement('progress');
progressBar.style.position='absolute';
progressBar.style.top=0;
progressBar.style.width='100%';
document.body.appendChild(progressBar);

const crcTable=(()=>{for(var a,o=[],c=0;c<256;c++){a=c;for(let f=0;f<8;f++)a=1&a?3988292384^a>>>1:a>>>1;o[c]=a};return o})(),
	crc32=b=>{for(var r=new Int8Array(b),n=-1,t=0;t<r.length;t++)n=n>>>8^crcTable[255&(n^r[t])];return~n}; //https://stackoverflow.com/questions/18638900/javascript-crc32

const state=window.__NUXT__.state; // it's where basically all the data is stored

let localHeaders=[], centralDirectory=[]; // 2 parts of zip file, will be concatenated and Blobified
let runningLocalHeaderTotal=0, runningCentralDirectoryTotal=0, runningFileCount=0; //gotta keep track of these for zip file

const utf8ified=s=>new TextEncoder().encode(s);

function addFile(path,data='') { //path is string. data is arraybuffer-like, or empty to create a folder instead of a file
	const localHeader=new DataView(new ArrayBuffer(26)); // it's the local header
	localHeader.setInt32(0,(data?10:20)+(1<<27),1); // 20 if folder, 10 otherwise. also utf-8 bit
	localHeader.setInt32(10,crc32(data),1); //CRC32
	for (const i of [14,18]) localHeader.setInt32(i,data.byteLength,1); //FILESIZE
	const filename8=utf8ified(path);
	localHeader.setInt16(22,filename8.length,1);
	localHeaders.push('PK\u0003\u0004',localHeader,filename8,data);
	
	const centralDirectoryEntry=new DataView(new ArrayBuffer(14));
	centralDirectoryEntry.setInt32(10,runningLocalHeaderTotal,1);
	centralDirectory.push('PK\u0001\u0002\u0014\u0000',localHeader,centralDirectoryEntry,filename8);

	runningLocalHeaderTotal+=30+filename8.length+(data.byteLength|0);
	runningCentralDirectoryTotal+=46+filename8.length;
	runningFileCount++;
}

addFile('mimetype',utf8ified('image/openraster'));
addFile('data/');
addFile('Thumbnails/');
addFile('comment.txt',utf8ified(state.imageMakerInfo.description));

// thumbnail and mergedimage.png, taken from previous picrew downloader
	const renderedImage = document.querySelector('canvas'); // already rendered image (good for thumbnails & such)
	await fetch(renderedImage.toDataURL()).then(r=>r.arrayBuffer()).then(x=>addFile('mergedimage.png',x));
	// going to create a smaller canvas for the required thumbnail
	const canvasScale = 256/Math.max(state.config.w, state.config.h); // scaling factor of canvas to match required thumbnail size
	const thumbCanvas = document.createElement('canvas');
	const scaledHeight = state.config.h * canvasScale |0, scaledWidth = state.config.w * canvasScale |0;
	thumbCanvas.width = scaledWidth;
	thumbCanvas.height = scaledHeight;
	thumbCanvas.getContext('2d').drawImage(renderedImage,0,0,scaledWidth,scaledHeight);
	await fetch(thumbCanvas.toDataURL()).then(r=>r.arrayBuffer()).then(x=>addFile('Thumbnails/thumbnail.png',x));
// ora layers stack:
	const stack = document.implementation.createDocument(null,'image'); // stack, which can be manipulated and converted to XML
	const image = stack.documentElement; // `image` element, root
	image.setAttribute('w',state.config.w);
	image.setAttribute('h',state.config.h);
	image.setAttribute('version', '0.0.6');
	const rootStack = stack.createElement('stack');
	image.appendChild(rootStack);

const downloadEntireMaker=!downloadCurrentState
// iterating thru images: the most important part
//layers→parts (one per layer right?)→items→colours
const localSettings=JSON.parse(localStorage['picrew.local.data.'+state.imageMakerId]);

if (downloadCurrentState) {
	progressBar.max=Object.values(localSettings).filter(x=>x.itmId).length; //itmId is 0 if unused?
	progressBar.value=0;
	for (const layer of Object.entries(state.config.lyrList).sort((a,b)=>b[1]-a[1])) { // layers in order
		const part=state.config.pList.find(p=>p.lyrs.includes(layer[0]|0));
		const local=localSettings[part.pId];
		if (state.commonImages[local.itmId]&&state.commonImages[local.itmId][layer[0]]&&state.commonImages[local.itmId][layer[0]][local.cId]) { //skip if nonexistent
			const oraLayer=stack.createElement('layer');
			const fetchUrl=state.commonImages[local.itmId][layer[0]][local.cId].url;
			const saveUrl='data/'+fetchUrl.split('/').pop();
			oraLayer.setAttribute('src',saveUrl);
			oraLayer.setAttribute('name',part.pNm);
			oraLayer.setAttribute('x',local.xCnt+part.x);
			oraLayer.setAttribute('y',local.yCnt+part.y);
			rootStack.appendChild(oraLayer);
			await fetch(fetchUrl).then(r=>r.arrayBuffer()).then(x=>addFile(saveUrl,x));
			progressBar.value++;
		}
	}
}

if (downloadEntireMaker) {
	progressBar.max=0;for (const item of Object.values(state.commonImages)) for (const layer of Object.values(item)) progressBar.max+=Object.keys(layer).length; // total number of images
	progressBar.value=0;
	for (const layer of Object.entries(state.config.lyrList).sort((a,b)=>b[1]-a[1])) { // layers in order
		const part=state.config.pList.find(p=>p.lyrs.includes(layer[0]|0)); // the part for each layer
		const partDir='data/'+layer[1]+'/';
		addFile(partDir);
		const partStack=stack.createElement('stack');
		rootStack.appendChild(partStack);
		partStack.setAttribute('name',part.pNm);
		for (const item of part.items) for (const colour of state.config.cpList[part.cpId]) {
			if (state.commonImages[item.itmId]&&state.commonImages[item.itmId][layer[0]]&&state.commonImages[item.itmId][layer[0]][colour.cId]) {// skip if nonexistent
				const oraLayer = stack.createElement('layer');
				partStack.appendChild(oraLayer);
				const fetchUrl=state.commonImages[item.itmId][layer[0]][colour.cId].url;
				const imageDir=partDir+item.itmId+colour.cd+fetchUrl.split('/').pop(); // sometimes multiple colours available with the same rgb values
				oraLayer.setAttribute('src',imageDir);
				const local=localSettings[part.pId]
				if (local.itmId==item.itmId&&local.cId==colour.cId) { //visible
					oraLayer.setAttribute('x',part.x+local.xCnt);
					oraLayer.setAttribute('y',part.y+local.yCnt);
				} else {
					oraLayer.setAttribute('visibility','hidden');
					oraLayer.setAttribute('x',part.x);
					oraLayer.setAttribute('y',part.y);
				}
				await fetch(fetchUrl).then(r=>r.arrayBuffer()).then(x=>addFile(imageDir,x));
				progressBar.value++;
			}
		}
	}
}

addFile('stack.xml',utf8ified(new XMLSerializer().serializeToString(stack)));

// end of central directory record
const centralDirectoryEnd=new DataView(new ArrayBuffer(18));
for (const i of [4,6]) centralDirectoryEnd.setInt16(i,runningFileCount,1);
centralDirectoryEnd.setInt32(8,runningCentralDirectoryTotal,1);
centralDirectoryEnd.setInt32(12,runningLocalHeaderTotal,1);
centralDirectory.push('PK\u0005\u0006',centralDirectoryEnd);

// turn it all into a blob and download
const finished=URL.createObjectURL(new Blob(localHeaders.concat(centralDirectory),{type:'application/zip'})),
finishedA=document.createElement('a');
finishedA.href=finished;
finishedA.download=state.imageMakerId +'.ora';
finishedA.click();
URL.revokeObjectURL(finished);

document.body.removeChild(progressBar);
})(false) // set to true to download current state; set to false to download entire maker.
.catch(alert)
