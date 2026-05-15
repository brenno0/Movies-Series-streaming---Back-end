import fs from 'fs';
import path from 'path';

import { google } from 'googleapis';

import { env } from '@/env';

function getDriveClient() {
  const credentials = JSON.parse(env.GOOGLE_DRIVE_CREDENTIALS ?? '{}');
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

export async function uploadToDrive(filePath: string, fileName: string): Promise<string> {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: { name: fileName },
    media: {
      mimeType: 'video/mp4',
      body: fs.createReadStream(filePath),
    },
    fields: 'id',
  });
  return res.data.id!;
}

export async function downloadFromDrive(fileId: string, destPath: string): Promise<void> {
  const drive = getDriveClient();
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

  const dest = fs.createWriteStream(destPath);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );

  await new Promise<void>((resolve, reject) => {
    (res.data as NodeJS.ReadableStream).pipe(dest)
      .on('finish', resolve)
      .on('error', reject);
  });
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}
