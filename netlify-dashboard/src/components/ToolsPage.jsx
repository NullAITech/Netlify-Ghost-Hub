import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  Box,
  Card,
  Typography,
  Stack,
  Grid,
  TextField,
  Button,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
  InputAdornment,
  IconButton,
  Tooltip,
  Paper,
  Snackbar,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Chip
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import TransformIcon from '@mui/icons-material/Transform';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import TerminalIcon from '@mui/icons-material/Terminal';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import RefreshIcon from '@mui/icons-material/Refresh';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';

function TabPanel({ children, value, index }) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        p: 2,
        overflowY: 'auto'
      }}
    >
      {children}
    </Box>
  );
}

export default function ToolsPage({ apiBase, onRepoCreated }) {
  const [tabValue, setTabValue] = useState(0);
  const [toolsStatus, setToolsStatus] = useState(null);
  const [loading, setLoading] = useState({ yt: false, ff: false, repo: false });
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const [ytSection, setYtSection] = useState('run');
  const [ffSection, setFfSection] = useState('basic');
  const [ffAdvancedPage, setFfAdvancedPage] = useState(0);
  const [repoSection, setRepoSection] = useState('form');

  const [ytForm, setYtForm] = useState({ url: '' });
  const [ytResult, setYtResult] = useState('');
  const [videoPreview, setVideoPreview] = useState(null);

  const [ffForm, setFfForm] = useState({
    input_path: '',
    output_name: '',
    output_format: 'mp4',
    video_codec: 'libx264',
    audio_codec: 'aac',
    audio_bitrate: '192k',
    preset: 'medium',
    crf: '23',
    start_time: '',
    duration: '',
    scale: '',
    fps: '',
    overwrite: true
  });
  const [ffResult, setFfResult] = useState('');

  const [repoForm, setRepoForm] = useState({
    name: '',
    description: '',
    visibility: 'private',
    create_github: true
  });
  const [repoResult, setRepoResult] = useState('');
  const [mediaLibrary, setMediaLibrary] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const ffUploadInputRef = useRef(null);
  const [nativeForm, setNativeForm] = useState({ whoisTarget: '', dnsDomain: '' });
  const [nativeResult, setNativeResult] = useState({ whois: '', dns: '' });
  const [nativeLoading, setNativeLoading] = useState({ whois: false, dns: false });

  const loadStatus = async () => {
    try {
      const res = await axios.get(`${apiBase}/api/tools/status`);
      setToolsStatus(res.data);
    } catch (e) {
      setToolsStatus(null);
    }
  };

  useEffect(() => {
    loadStatus();
    loadMediaLibrary();
  }, [apiBase]);

  const loadMediaLibrary = async () => {
    setMediaLoading(true);
    try {
      const res = await axios.get(`${apiBase}/api/tools/downloads/media`);
      setMediaLibrary(res.data?.media || []);
    } catch (e) {
      setMediaLibrary([]);
    } finally {
      setMediaLoading(false);
    }
  };

  const showNotify = (message) => setSnackbar({ open: true, message });

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showNotify('Copied to clipboard');
  };

  const handleRun = async (tool, callback) => {
    setLoading((prev) => ({ ...prev, [tool]: true }));
    await callback();
    setLoading((prev) => ({ ...prev, [tool]: false }));
  };

  const runYt = () =>
    handleRun('yt', async () => {
      setVideoPreview(null);
      setYtResult('Running terminal command...');
      try {
        const res = await axios.post(`${apiBase}/api/tools/yt-dlp`, ytForm);
        setVideoPreview({
          title: res.data.title,
          folder: res.data.folder,
          videoUrl: `${apiBase}${res.data.video_url}`,
          thumbUrl: `${apiBase}${res.data.thumb_url}`
        });
        setYtResult(`Success\nFolder: ${res.data.folder}`);
        setYtSection('preview');
        loadMediaLibrary();
      } catch (e) {
        setYtResult(`Error: ${e.response?.data?.detail || e.message}`);
        setYtSection('output');
      }
    });

  const runFfmpeg = () =>
    handleRun('ff', async () => {
      setFfResult('Running ffmpeg...');
      try {
        const res = await axios.post(`${apiBase}/api/tools/ffmpeg/convert`, ffForm);
        setFfResult(`Success\nOutput file: ${res.data.output_file}`);
      } catch (e) {
        setFfResult(`Error: ${e.response?.data?.detail || e.message}`);
      }
      setFfSection('output');
      loadMediaLibrary();
    });

  const uploadFfInput = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setFfResult('Uploading file...');
    try {
      const res = await axios.post(`${apiBase}/api/tools/uploads`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFfForm((prev) => ({ ...prev, input_path: res.data.input_path }));
      setFfResult(`File uploaded\nInput file path: ${res.data.input_path}`);
      loadMediaLibrary();
    } catch (e) {
      setFfResult(`Upload Error: ${e.response?.data?.detail || e.message}`);
    } finally {
      event.target.value = '';
    }
  };

  const createRepo = () =>
    handleRun('repo', async () => {
      setRepoResult('Creating repository...');
      try {
        const res = await axios.post(`${apiBase}/api/tools/repo/create`, repoForm);
        setRepoResult(`Success\nRepo path: ${res.data.repo_path}\nGitHub: ${res.data.github.message}`);
        onRepoCreated?.();
      } catch (e) {
        setRepoResult(`Error: ${e.response?.data?.detail || e.message}`);
      }
      setRepoSection('output');
    });

  const runWhois = async () => {
    setNativeLoading((prev) => ({ ...prev, whois: true }));
    try {
      const res = await axios.post(`${apiBase}/api/tools/native/whois`, { target: nativeForm.whoisTarget });
      setNativeResult((prev) => ({ ...prev, whois: res.data?.output || '' }));
    } catch (e) {
      setNativeResult((prev) => ({ ...prev, whois: `Error: ${e.response?.data?.detail || e.message}` }));
    } finally {
      setNativeLoading((prev) => ({ ...prev, whois: false }));
    }
  };

  const runDns = async () => {
    setNativeLoading((prev) => ({ ...prev, dns: true }));
    try {
      const res = await axios.post(`${apiBase}/api/tools/native/dns`, { domain: nativeForm.dnsDomain });
      if (res.data?.resolver === 'dig') {
        const records = res.data?.records || {};
        const output = Object.keys(records)
          .map((key) => `${key}\n${(records[key] || []).join('\n') || '(none)'}`)
          .join('\n\n');
        setNativeResult((prev) => ({ ...prev, dns: output }));
      } else {
        setNativeResult((prev) => ({ ...prev, dns: res.data?.raw_output || '' }));
      }
    } catch (e) {
      setNativeResult((prev) => ({ ...prev, dns: `Error: ${e.response?.data?.detail || e.message}` }));
    } finally {
      setNativeLoading((prev) => ({ ...prev, dns: false }));
    }
  };

  const statusItems = toolsStatus
    ? [
        { label: `yt-dlp: ${toolsStatus.yt_dlp ? 'available' : 'missing'}`, ok: toolsStatus.yt_dlp },
        { label: `ffmpeg: ${toolsStatus.ffmpeg ? 'available' : 'missing'}`, ok: toolsStatus.ffmpeg },
        { label: `gh: ${toolsStatus.gh ? 'available' : 'missing'}`, ok: toolsStatus.gh },
        { label: `whois: ${toolsStatus.whois ? 'available' : 'missing'}`, ok: toolsStatus.whois },
        { label: `dns: ${toolsStatus.dig || toolsStatus.nslookup ? 'available' : 'missing'}`, ok: toolsStatus.dig || toolsStatus.nslookup }
      ]
    : [];

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mr: 1 }}>
          System Tools
        </Typography>
        {statusItems.map((item) => (
          <Chip key={item.label} size="small" label={item.label} color={item.ok ? 'success' : 'default'} />
        ))}
      </Stack>

      <Alert severity="info" sx={{ mb: 1.5 }}>
        Screen-fit mode enabled: switch sections with tabs and segmented controls.
      </Alert>

      <Paper
        sx={{
          width: '100%',
          border: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(event, value) => setTabValue(value)}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab icon={<DownloadIcon />} label="yt-dlp Download" />
          <Tab icon={<TransformIcon />} label="ffmpeg Convert" />
          <Tab icon={<CreateNewFolderIcon />} label="Create Repo" />
          <Tab icon={<TravelExploreIcon />} label="Native Linux" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
            <ToggleButtonGroup
              value={ytSection}
              exclusive
              onChange={(event, nextValue) => nextValue && setYtSection(nextValue)}
              size="small"
            >
              <ToggleButton value="run">Run</ToggleButton>
              <ToggleButton value="preview">Preview</ToggleButton>
              <ToggleButton value="output">Output</ToggleButton>
            </ToggleButtonGroup>

            {ytSection === 'run' && (
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    label="Media URL"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={ytForm.url}
                    onChange={(event) => setYtForm({ ...ytForm, url: event.target.value })}
                    fullWidth
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <TerminalIcon fontSize="small" />
                        </InputAdornment>
                      )
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={runYt}
                    disabled={loading.yt || !ytForm.url}
                    startIcon={loading.yt ? <CircularProgress size={18} /> : <DownloadIcon />}
                    sx={{ minWidth: { xs: '100%', md: 220 } }}
                  >
                    {loading.yt ? 'Processing...' : 'Execute Download'}
                  </Button>
                </Stack>
              </Stack>
            )}

            {ytSection === 'preview' && (
              <Card variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle2">Media Preview + Downloads Library</Typography>
                    <Button size="small" startIcon={<RefreshIcon />} onClick={loadMediaLibrary} disabled={mediaLoading}>
                      Refresh
                    </Button>
                  </Stack>
                </Box>
                <Box sx={{ p: 2, maxHeight: 580, overflowY: 'auto' }}>
                  {videoPreview ? (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Latest Download
                      </Typography>
                      {videoPreview.videoUrl ? (
                        <video controls poster={videoPreview.thumbUrl} style={{ width: '100%', maxHeight: 300, backgroundColor: '#000' }}>
                          <source src={videoPreview.videoUrl} />
                          Your browser does not support the video tag.
                        </video>
                      ) : (
                        videoPreview.thumbUrl && (
                          <img src={videoPreview.thumbUrl} alt="Thumbnail" style={{ width: '100%', maxHeight: 300, objectFit: 'cover' }} />
                        )
                      )}
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {videoPreview.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                        {videoPreview.folder}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      Run download first to populate latest preview.
                    </Typography>
                  )}
                  <Divider sx={{ mb: 1.5 }} />
                  <Typography variant="caption" color="text.secondary">
                    All media in downloads folder ({mediaLibrary.length})
                  </Typography>
                  <Grid container spacing={1} sx={{ mt: 0.5 }}>
                    {mediaLibrary.map((item) => (
                      <Grid item xs={12} md={6} key={item.rel_path}>
                        <Card variant="outlined" sx={{ p: 1 }}>
                          <Typography variant="caption" sx={{ display: 'block', mb: 0.7, wordBreak: 'break-all' }}>
                            {item.rel_path}
                          </Typography>
                          {item.type === 'video' ? (
                            <video controls style={{ width: '100%', maxHeight: 170, backgroundColor: '#000' }}>
                              <source src={`${apiBase}${item.url}`} />
                            </video>
                          ) : item.type === 'audio' ? (
                            <audio controls style={{ width: '100%' }}>
                              <source src={`${apiBase}${item.url}`} />
                            </audio>
                          ) : (
                            <img
                              src={`${apiBase}${item.url}`}
                              alt={item.name}
                              style={{ width: '100%', maxHeight: 170, objectFit: 'cover', borderRadius: 8 }}
                            />
                          )}
                        </Card>
                      </Grid>
                    ))}
                    {!mediaLoading && mediaLibrary.length === 0 && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">
                          No downloadable media found yet.
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                </Box>
              </Card>
            )}

            {ytSection === 'output' && (
              <TextField
                label="Console Output"
                value={ytResult}
                multiline
                minRows={8}
                fullWidth
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Copy Output">
                        <IconButton onClick={() => copyToClipboard(ytResult)}>
                          <ContentCopyIcon />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  )
                }}
              />
            )}
          </Stack>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
            <ToggleButtonGroup
              value={ffSection}
              exclusive
              onChange={(event, nextValue) => nextValue && setFfSection(nextValue)}
              size="small"
            >
              <ToggleButton value="basic">Basic</ToggleButton>
              <ToggleButton value="advanced">Advanced</ToggleButton>
              <ToggleButton value="output">Output</ToggleButton>
            </ToggleButtonGroup>

            {ffSection === 'basic' && (
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <Button
                    variant="outlined"
                    startIcon={<UploadFileIcon />}
                    onClick={() => ffUploadInputRef.current?.click()}
                  >
                    Import Local File
                  </Button>
                  <input
                    ref={ffUploadInputRef}
                    type="file"
                    onChange={uploadFfInput}
                    style={{ display: 'none' }}
                  />
                </Stack>
                <TextField
                  label="Input File Path"
                  value={ffForm.input_path}
                  onChange={(event) => setFfForm({ ...ffForm, input_path: event.target.value })}
                  fullWidth
                  size="small"
                />
                <Grid container spacing={1.5}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Output Name"
                      value={ffForm.output_name}
                      onChange={(event) => setFfForm({ ...ffForm, output_name: event.target.value })}
                      fullWidth
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      select
                      label="Output Format"
                      value={ffForm.output_format}
                      onChange={(event) => setFfForm({ ...ffForm, output_format: event.target.value })}
                      fullWidth
                      size="small"
                    >
                      <MenuItem value="mp4">mp4</MenuItem>
                      <MenuItem value="webm">webm</MenuItem>
                      <MenuItem value="mp3">mp3</MenuItem>
                      <MenuItem value="wav">wav</MenuItem>
                      <MenuItem value="gif">gif</MenuItem>
                      <MenuItem value="jpg">jpg</MenuItem>
                      <MenuItem value="png">png</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={ffForm.overwrite}
                      onChange={(event) => setFfForm({ ...ffForm, overwrite: event.target.checked })}
                    />
                  }
                  label="Overwrite output file"
                />
                <Button
                  variant="contained"
                  onClick={runFfmpeg}
                  disabled={loading.ff || !ffForm.input_path}
                  startIcon={loading.ff ? <CircularProgress size={18} /> : <TransformIcon />}
                >
                  {loading.ff ? 'Converting...' : 'Run ffmpeg'}
                </Button>
              </Stack>
            )}

            {ffSection === 'advanced' && (
              <Stack spacing={1.5}>
                <Divider>
                  <Typography variant="caption">Advanced Encoding</Typography>
                </Divider>
                <Grid container spacing={1.5}>
                  {ffAdvancedPage === 0 && (
                    <>
                      <Grid item xs={6}>
                        <TextField
                          label="Video Codec"
                          value={ffForm.video_codec}
                          onChange={(event) => setFfForm({ ...ffForm, video_codec: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Audio Codec"
                          value={ffForm.audio_codec}
                          onChange={(event) => setFfForm({ ...ffForm, audio_codec: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Audio Bitrate"
                          value={ffForm.audio_bitrate}
                          onChange={(event) => setFfForm({ ...ffForm, audio_bitrate: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Preset"
                          value={ffForm.preset}
                          onChange={(event) => setFfForm({ ...ffForm, preset: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="CRF"
                          value={ffForm.crf}
                          onChange={(event) => setFfForm({ ...ffForm, crf: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                    </>
                  )}
                  {ffAdvancedPage === 1 && (
                    <>
                      <Grid item xs={6}>
                        <TextField
                          label="Scale"
                          value={ffForm.scale}
                          onChange={(event) => setFfForm({ ...ffForm, scale: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Start Time"
                          value={ffForm.start_time}
                          onChange={(event) => setFfForm({ ...ffForm, start_time: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="Duration"
                          value={ffForm.duration}
                          onChange={(event) => setFfForm({ ...ffForm, duration: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="FPS"
                          value={ffForm.fps}
                          onChange={(event) => setFfForm({ ...ffForm, fps: event.target.value })}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                    </>
                  )}
                </Grid>
                <Stack direction="row" spacing={1}>
                  <Button size="small" onClick={() => setFfAdvancedPage(0)} disabled={ffAdvancedPage === 0}>
                    Page 1
                  </Button>
                  <Button size="small" onClick={() => setFfAdvancedPage(1)} disabled={ffAdvancedPage === 1}>
                    Page 2
                  </Button>
                </Stack>
                <Button
                  variant="contained"
                  onClick={runFfmpeg}
                  disabled={loading.ff || !ffForm.input_path}
                  startIcon={loading.ff ? <CircularProgress size={18} /> : <TransformIcon />}
                >
                  {loading.ff ? 'Converting...' : 'Run ffmpeg'}
                </Button>
              </Stack>
            )}

            {ffSection === 'output' && (
              <TextField
                label="ffmpeg Output"
                value={ffResult}
                multiline
                minRows={8}
                fullWidth
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Copy Output">
                        <IconButton onClick={() => copyToClipboard(ffResult)}>
                          <ContentCopyIcon />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  )
                }}
              />
            )}
          </Stack>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Stack spacing={2}>
            <ToggleButtonGroup
              value={repoSection}
              exclusive
              onChange={(event, nextValue) => nextValue && setRepoSection(nextValue)}
              size="small"
            >
              <ToggleButton value="form">Form</ToggleButton>
              <ToggleButton value="output">Output</ToggleButton>
            </ToggleButtonGroup>

            {repoSection === 'form' && (
              <Stack spacing={1.5}>
                <TextField
                  label="Repository Name"
                  value={repoForm.name}
                  onChange={(event) => setRepoForm({ ...repoForm, name: event.target.value })}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Description"
                  multiline
                  rows={2}
                  value={repoForm.description}
                  onChange={(event) => setRepoForm({ ...repoForm, description: event.target.value })}
                  fullWidth
                  size="small"
                />
                <Grid container spacing={1.5} alignItems="center">
                  <Grid item xs={12} md={6}>
                    <TextField
                      select
                      label="Visibility"
                      value={repoForm.visibility}
                      onChange={(event) => setRepoForm({ ...repoForm, visibility: event.target.value })}
                      fullWidth
                      size="small"
                    >
                      <MenuItem value="private">Private</MenuItem>
                      <MenuItem value="public">Public</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={repoForm.create_github}
                          onChange={(event) => setRepoForm({ ...repoForm, create_github: event.target.checked })}
                        />
                      }
                      label="Also create on GitHub"
                    />
                  </Grid>
                </Grid>
                <Button
                  variant="contained"
                  onClick={createRepo}
                  disabled={loading.repo || !repoForm.name}
                  startIcon={loading.repo ? <CircularProgress size={18} /> : <CreateNewFolderIcon />}
                >
                  {loading.repo ? 'Creating...' : 'Create Repository'}
                </Button>
              </Stack>
            )}

            {repoSection === 'output' && (
              <TextField
                label="Repository Output"
                value={repoResult}
                multiline
                minRows={8}
                fullWidth
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Copy Output">
                        <IconButton onClick={() => copyToClipboard(repoResult)}>
                          <ContentCopyIcon />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  )
                }}
              />
            )}
          </Stack>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Stack spacing={2}>
            <Card variant="outlined">
              <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2">WHOIS Lookup</Typography>
              </Box>
              <Box sx={{ p: 1.5 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
                  <TextField
                    label="Domain or IP"
                    placeholder="example.com"
                    value={nativeForm.whoisTarget}
                    onChange={(event) => setNativeForm({ ...nativeForm, whoisTarget: event.target.value })}
                    fullWidth
                    size="small"
                  />
                  <Button variant="contained" onClick={runWhois} disabled={nativeLoading.whois || !nativeForm.whoisTarget}>
                    {nativeLoading.whois ? 'Running...' : 'Run WHOIS'}
                  </Button>
                </Stack>
                <TextField
                  label="WHOIS Output"
                  value={nativeResult.whois}
                  multiline
                  minRows={8}
                  fullWidth
                  sx={{ mt: 1.2 }}
                  InputProps={{ readOnly: true }}
                />
              </Box>
            </Card>

            <Card variant="outlined">
              <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2">DNS Lookup</Typography>
              </Box>
              <Box sx={{ p: 1.5 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
                  <TextField
                    label="Domain"
                    placeholder="example.com"
                    value={nativeForm.dnsDomain}
                    onChange={(event) => setNativeForm({ ...nativeForm, dnsDomain: event.target.value })}
                    fullWidth
                    size="small"
                  />
                  <Button variant="contained" onClick={runDns} disabled={nativeLoading.dns || !nativeForm.dnsDomain}>
                    {nativeLoading.dns ? 'Running...' : 'Run DNS Lookup'}
                  </Button>
                </Stack>
                <TextField
                  label="DNS Output"
                  value={nativeResult.dns}
                  multiline
                  minRows={8}
                  fullWidth
                  sx={{ mt: 1.2 }}
                  InputProps={{ readOnly: true }}
                />
              </Box>
            </Card>
          </Stack>
        </TabPanel>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={2500}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Box>
  );
}
