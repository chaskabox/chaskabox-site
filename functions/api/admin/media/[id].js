import {withAdmin,httpError} from '../_lib/auth.js';
import {deleteMedia} from '../_lib/media.js';
export const onRequestDelete=withAdmin(['owner','manager','content'],(context,{user})=>{
  const id=String(context.params.id||'');
  if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))httpError('Invalid media id',400,'invalid_id');
  return deleteMedia(context,user,id);
});
