import { supabase } from '@/lib/supabase';
import { shrinkPhoto, uploadCompletionPhoto } from '@/lib/photos';

export type CompletionActionState = { error: string | null };

/**
 * Port of app/actions/completions.ts's submitProof.
 *
 * The web received a FormData holding a canvas-shrunk Blob; here the picker
 * hands over a file URI plus its natural size, and the shrinking happens on
 * the device. Everything after that is identical, including the fact that
 * only the couple id is needed to build the storage path — the storage RLS
 * policy and the submit_completion RPC enforce that it is really the
 * viewer's, so nothing here is trusted.
 */
export async function submitProof(
  coupleId: string,
  taskId: string,
  photo: { uri: string; width: number; height: number },
): Promise<CompletionActionState> {
  let path: string;
  try {
    const { bytes } = await shrinkPhoto(photo.uri, photo.width, photo.height);
    path = await uploadCompletionPhoto(coupleId, taskId, bytes);
  } catch {
    return { error: 'upload failed, try again' };
  }

  // the RPC stamps the date itself using the submitter's stored timezone
  const { error } = await supabase.rpc('submit_completion', {
    p_task_id: taskId,
    p_photo_path: path,
  });
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}

export async function confirmProof(
  completionId: string,
): Promise<CompletionActionState> {
  // approve_completion is SECURITY DEFINER and re-checks couple membership +
  // "not your own submission", so no extra viewer lookup is needed here
  const { error } = await supabase.rpc('approve_completion', {
    p_completion_id: completionId,
  });
  if (error) return { error: error.message.toLowerCase() };
  return { error: null };
}
