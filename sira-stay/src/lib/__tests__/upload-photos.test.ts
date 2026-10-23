import { ImageManipulator } from 'expo-image-manipulator';

import type { PickedImage } from '../pick-image';
import { PhotoPrepError, UPLOAD_MAX_PX, prepareUploadPhotos, toUploadJpeg } from '../upload-photos';

// The native image work happens on the phone; here we check what the app asks it to do.
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: { manipulate: jest.fn() },
}));

const manipulate = ImageManipulator.manipulate as jest.Mock;

function fakeNative({ failSave = false } = {}) {
  const image = {
    saveAsync: failSave ? jest.fn().mockRejectedValue(new Error('decode failed')) : jest.fn().mockResolvedValue({ uri: 'file:///cache/out.jpg' }),
    release: jest.fn(),
  };
  const context = { resize: jest.fn(), renderAsync: jest.fn().mockResolvedValue(image), release: jest.fn() };
  context.resize.mockReturnValue(context);
  manipulate.mockReturnValue(context);
  return { context, image };
}

const heic: PickedImage = { uri: 'file:///picker/IMG_0001.HEIC', width: 4032, height: 3024, mimeType: 'image/heic', fileName: 'IMG_0001.HEIC' };

beforeEach(() => manipulate.mockReset());

describe('toUploadJpeg', () => {
  it('turns an iPhone HEIC photo into a JPEG upload', async () => {
    const { image } = fakeNative();
    await expect(toUploadJpeg(heic, 'photo-1')).resolves.toEqual({ uri: 'file:///cache/out.jpg', name: 'photo-1.jpg', type: 'image/jpeg' });
    expect(manipulate).toHaveBeenCalledWith(heic.uri);
    expect(image.saveAsync).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpeg' }));
  });

  it('re-encodes JPEGs too, so no EXIF/GPS ever leaves the phone', async () => {
    const { image } = fakeNative();
    await toUploadJpeg({ uri: 'file:///picker/a.jpg', width: 1600, height: 1200, mimeType: 'image/jpeg' }, 'photo-2');
    expect(image.saveAsync).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpeg' }));
  });

  it('scales the longest side down to the upload limit', async () => {
    const { context } = fakeNative();
    await toUploadJpeg(heic, 'landscape');
    expect(context.resize).toHaveBeenCalledWith({ width: UPLOAD_MAX_PX });

    const portrait = fakeNative();
    await toUploadJpeg({ ...heic, width: 3024, height: 4032 }, 'portrait');
    expect(portrait.context.resize).toHaveBeenCalledWith({ height: UPLOAD_MAX_PX });
  });

  it('never enlarges small photos', async () => {
    const { context } = fakeNative();
    await toUploadJpeg({ ...heic, width: 1200, height: 900 }, 'small');
    expect(context.resize).not.toHaveBeenCalled();
  });

  it('frees native memory even when the photo cannot be read', async () => {
    const { context, image } = fakeNative({ failSave: true });
    await expect(toUploadJpeg(heic, 'broken')).rejects.toThrow('decode failed');
    expect(image.release).toHaveBeenCalled();
    expect(context.release).toHaveBeenCalled();
  });
});

describe('prepareUploadPhotos', () => {
  it('names the files in upload order', async () => {
    fakeNative();
    const files = await prepareUploadPhotos([heic, heic]);
    expect(files.map((f) => f.name)).toEqual(['photo-1.jpg', 'photo-2.jpg']);
  });

  it('says which photo failed', async () => {
    const good = fakeNative().context;
    const bad = fakeNative({ failSave: true }).context;
    manipulate.mockReturnValueOnce(good).mockReturnValueOnce(bad);
    const error = await prepareUploadPhotos([heic, heic]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PhotoPrepError);
    expect((error as PhotoPrepError).index).toBe(1);
  });
});
