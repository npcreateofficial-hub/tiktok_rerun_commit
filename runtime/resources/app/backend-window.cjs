// Keep full Chrome rendering while the web viewer remains the user-facing UI.
async function parkBackendWindow(context,page){
  const cdp=await context.newCDPSession(page);
  try{
    const {windowId}=await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
    await cdp.send('Browser.setWindowBounds',{windowId,bounds:{left:-24000,top:-24000,width:1640,height:1000}});
    const {bounds}=await cdp.send('Browser.getWindowBounds',{windowId});
    if(bounds.left>=0||bounds.top>=0)throw Error('ไม่สามารถจัดหน้าต่าง backend ให้อยู่นอกพื้นที่จอได้');
  }finally{await cdp.detach();}
}
module.exports={parkBackendWindow};
