export interface RdTorrentFile {
  id: number;
  path: string;
  bytes: number;
  selected: 0 | 1;
}

export interface RdTorrentInfo {
  id: string;
  filename: string;
  status:
    | 'magnet_error'
    | 'magnet_conversion'
    | 'waiting_files_selection'
    | 'queued'
    | 'downloading'
    | 'downloaded'
    | 'error'
    | 'virus'
    | 'compressing'
    | 'uploading'
    | 'dead';
  files: RdTorrentFile[];
  links: string[];
}

export interface RdUnrestrictedLink {
  download: string;
  filename: string;
  mimeType: string;
  filesize: number;
}
