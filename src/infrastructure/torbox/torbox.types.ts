export interface TorBoxFile {
  id: number;
  short_name: string;
  name: string;
  size: number;
}

export interface TorBoxTorrentInfo {
  id: number;
  hash: string;
  download_state: string;
  download_finished: boolean;
  files: TorBoxFile[];
}

export interface TorBoxCreateTorrentResponse {
  success: boolean;
  data: { torrent_id: number; hash: string };
}

export interface TorBoxMyListResponse {
  success: boolean;
  data: TorBoxTorrentInfo | TorBoxTorrentInfo[];
}

export interface TorBoxRequestDlResponse {
  success: boolean;
  data: string;
}
