import { useState, useEffect, FormEvent, Fragment, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Droplets, 
  Users, 
  Menu, 
  X, 
  Sprout, 
  CloudRain, 
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Tractor,
  Sun,
  Map as MapIcon,
  MapPin,
  Trash2,
  Upload
} from 'lucide-react';
import Webcam from 'react-webcam';
import axios from 'axios';
import { format, addDays, parseISO, differenceInDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polygon, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// --- Types ---
type Tab = 'detect' | 'irrigation' | 'map' | 'community';

interface AnalysisResult {
  condition: string;
  confidence: number;
  treatment: string;
  description: string;
}

interface WeatherData {
  time: string[];
  precipitation_sum: number[];
  temperature_2m_max: number[];
}

interface Schedule {
  id: number;
  farmerName: string;
  variety: string;
  plantingDate: string;
  harvestDate: string;
  areaSize: number;
  lat?: number;
  lng?: number;
  polygon?: string;
}

interface User {
  username: string;
  lat: number;
  lng: number;
}

interface DiseaseReport {
  id: number;
  farmerName: string;
  diseaseName: string;
  lat: number;
  lng: number;
  date: string;
}

// --- Components ---

const SimpleLocationPicker = ({ position, setPosition }: { position: [number, number], setPosition: (pos: [number, number]) => void }) => {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return <Marker position={position} />;
};

const AuthPage = ({ onLogin }: { onLogin: (u: User) => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [lat, setLat] = useState(-6.2088);
  const [lng, setLng] = useState(106.8456);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLogin && navigator.geolocation) {
       navigator.geolocation.getCurrentPosition(pos => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
       }, () => {});
    }
  }, [isLogin]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const res = await axios.post('/api/auth/login', { username, password });
        onLogin(res.data.user);
      } else {
        const res = await axios.post('/api/auth/register', { username, password, lat, lng });
        onLogin(res.data.user);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 p-4 flex flex-col justify-center items-center pb-12">
       <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 max-w-sm w-full">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-emerald-800 tracking-tight">PadiSmart</h1>
            <p className="text-stone-500 text-sm">{isLogin ? 'Masuk ke akun Anda' : 'Daftar akun baru'}</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Username</label>
              <input type="text" required className="w-full p-2 border border-stone-200 rounded-lg" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
              <input type="password" required className="w-full p-2 border border-stone-200 rounded-lg" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1 flex items-center gap-2">
                  <MapPin size={16} /> Titik Default Lahan
                </label>
                <div className="h-40 rounded-lg overflow-hidden border border-stone-200 z-0 relative">
                  <MapContainer center={[lat, lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full">
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <SimpleLocationPicker position={[lat, lng]} setPosition={(p) => { setLat(p[0]); setLng(p[1]); }} />
                  </MapContainer>
                </div>
                <p className="text-xs text-stone-500 mt-1">Tap pada peta untuk menentukan lokasi sawah Anda.</p>
              </div>
            )}
          </div>

          <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-medium mt-6 disabled:opacity-50 shadow-md">
            {loading ? 'Memproses...' : (isLogin ? 'Masuk' : 'Daftar')}
          </button>
          
          <p className="text-center text-sm text-stone-500 mt-4">
            {isLogin ? 'Belum punya akun? ' : 'Sudah punya akun? '}
            <button type="button" onClick={() => { setIsLogin(!isLogin); setUsername(''); setPassword(''); }} className="text-emerald-600 font-medium">{isLogin ? 'Daftar' : 'Masuk'}</button>
          </p>
       </form>
    </div>
  );
}

const Navigation = ({ activeTab, setTab }: { activeTab: Tab, setTab: (t: Tab) => void }) => (
  <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 pb-safe pt-2 px-4 z-50 shadow-lg">
    <div className="flex justify-around items-center max-w-md mx-auto h-16">
      <button 
        onClick={() => setTab('detect')}
        className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'detect' ? 'text-emerald-600 bg-emerald-50' : 'text-stone-500'}`}
      >
        <Camera size={24} />
        <span className="text-xs font-medium mt-1">Deteksi</span>
      </button>
      <button 
        onClick={() => setTab('irrigation')}
        className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'irrigation' ? 'text-blue-600 bg-blue-50' : 'text-stone-500'}`}
      >
        <Droplets size={24} />
        <span className="text-xs font-medium mt-1">Irigasi</span>
      </button>
      <button 
        onClick={() => setTab('map')}
        className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'map' ? 'text-indigo-600 bg-indigo-50' : 'text-stone-500'}`}
      >
        <MapIcon size={24} />
        <span className="text-xs font-medium mt-1">Peta</span>
      </button>
      <button 
        onClick={() => setTab('community')}
        className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'community' ? 'text-amber-600 bg-amber-50' : 'text-stone-500'}`}
      >
        <Users size={24} />
        <span className="text-xs font-medium mt-1">Komunitas</span>
      </button>
    </div>
  </nav>
);

const DetectionFeature = ({ currentUser, onLogout }: { currentUser: User, onLogout: () => void }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  
  const [farmerName, setFarmerName] = useState(currentUser.username);
  const [reporting, setReporting] = useState(false);
  const [reportLat, setReportLat] = useState(currentUser.lat);
  const [reportLng, setReportLng] = useState(currentUser.lng);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setImgSrc(base64String);
        analyzeImage(base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const capture = (getScreenshot: () => string | null) => {
    const image = getScreenshot();
    if (image) {
      setImgSrc(image);
      setCameraOpen(false);
      analyzeImage(image);
    }
  };

  const analyzeImage = async (base64Image: string) => {
    setAnalyzing(true);
    setResult(null);
    try {
      const response = await axios.post('/api/analyze', { image: base64Image });
      setResult(response.data);
    } catch (error: any) {
      console.error(error);
      const backendError = error.response?.data?.error;
      alert(backendError ? `Error: ${backendError}` : 'Gagal menganalisis gambar. Pastikan koneksi internet stabil.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleReport = async () => {
    if (!farmerName) return;
    setReporting(true);
    
    try {
      await axios.post('/api/reports', {
        farmerName,
        diseaseName: result?.condition,
        lat: reportLat,
        lng: reportLng,
        date: new Date().toISOString()
      });
      alert('Berhasil melaporkan ke peta!');
    } catch(e) {
      alert('Gagal melaporkan');
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="p-4 pb-24 max-w-md mx-auto">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Deteksi Penyakit</h1>
          <p className="text-stone-500">Analisis kesehatan tanaman padi Anda</p>
        </div>
        <button onClick={onLogout} className="text-xs font-semibold text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">Logout</button>
      </header>

      {!imgSrc && !cameraOpen && (
        <div className="bg-stone-100 rounded-2xl p-6 flex flex-col items-center justify-center border-2 border-dashed border-stone-300 mb-6 min-h-[16rem]">
          <Sprout className="text-stone-400 mb-6" size={48} />
          <div className="flex gap-3 w-full max-w-xs">
            <button 
              onClick={() => setCameraOpen(true)}
              className="flex-1 bg-emerald-600 text-white py-3 px-2 rounded-xl font-medium shadow-md hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              <Camera size={20} />
              <span className="text-sm">Kamera</span>
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 bg-white text-emerald-700 border-2 border-emerald-600 py-3 px-2 rounded-xl font-medium shadow-sm hover:bg-emerald-50 transition-colors flex items-center justify-center gap-2"
            >
              <Upload size={20} />
              <span className="text-sm">Galeri</span>
            </button>
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleFileUpload} 
            />
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="relative rounded-2xl overflow-hidden shadow-xl mb-6 bg-black">
          <Webcam
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "environment" }}
            className="w-full"
            disablePictureInPicture={false}
            forceScreenshotSourceSize={false}
            imageSmoothing={true}
            mirrored={false}
            onUserMedia={() => {}}
            onUserMediaError={() => {}}
            screenshotQuality={0.92}
          >
            {({ getScreenshot }: { getScreenshot: () => string | null }) => (
              <button
                onClick={() => capture(getScreenshot)}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 bg-white rounded-full border-4 border-emerald-500 shadow-lg flex items-center justify-center"
              >
                <div className="w-12 h-12 bg-emerald-500 rounded-full" />
              </button>
            )}
          </Webcam>
          <button 
            onClick={() => setCameraOpen(false)}
            className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {imgSrc && (
        <div className="mb-6 relative">
          <img src={imgSrc} alt="Captured" className="rounded-2xl shadow-md w-full" />
          {!analyzing && (
            <button 
              onClick={() => { setImgSrc(null); setResult(null); }}
              className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full backdrop-blur-sm"
            >
              <X size={20} />
            </button>
          )}
        </div>
      )}

      {analyzing && (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-stone-600 font-medium">Menganalisis tanaman...</p>
          <p className="text-xs text-stone-400 mt-1">Menggunakan Gemini AI</p>
        </div>
      )}

      {result && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-lg border border-stone-100"
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-stone-900">{result.condition}</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-2 w-24 bg-stone-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${result.confidence}%` }}
                  />
                </div>
                <span className="text-xs text-stone-500">{result.confidence}% Akurat</span>
              </div>
            </div>
            {result.condition === 'Healthy' ? (
              <CheckCircle2 className="text-emerald-500" size={32} />
            ) : (
              <AlertTriangle className="text-amber-500" size={32} />
            )}
          </div>
          
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-stone-700 mb-1">Deskripsi</h3>
            <p className="text-stone-600 text-sm leading-relaxed">{result.description}</p>
          </div>

          <div className="bg-emerald-50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-emerald-800 mb-1">Saran Penanganan</h3>
            <p className="text-emerald-700 text-sm leading-relaxed">{result.treatment}</p>
          </div>

          {result.condition !== 'Healthy' && (
            <div className="border-t border-stone-100 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-stone-700 mb-2">Laporkan Temuan di Peta</h3>
              <p className="text-xs text-stone-500 mb-2">
                Lokasi diambil dari titik default/lahan yang Anda daftarkan. Anda dapat menggeser pin jika titik temuan berbeda:
              </p>
              
              <div className="h-40 rounded-lg overflow-hidden border border-stone-200 z-0 relative mb-3">
                <MapContainer center={[reportLat, reportLng]} zoom={15} scrollWheelZoom={false} className="h-full w-full">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <SimpleLocationPicker position={[reportLat, reportLng]} setPosition={(p) => { setReportLat(p[0]); setReportLng(p[1]); }} />
                </MapContainer>
              </div>
              
              <button 
                onClick={handleReport}
                disabled={reporting}
                className="w-full bg-red-500 text-white py-3 rounded-xl text-sm font-medium shadow-md disabled:opacity-50"
              >
                {reporting ? 'Melapor...' : 'Laporkan Area Ini'}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

const IrrigationFeature = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock location (Jakarta) for demo if geolocation fails or for speed
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const res = await axios.get(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum&timezone=auto`
        );
        setWeather(res.data.daily);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(-6.2088, 106.8456) // Default Jakarta
      );
    } else {
      fetchWeather(-6.2088, 106.8456);
    }
  }, []);

  const getIrrigationAdvice = () => {
    if (!weather) return { status: 'Loading', advice: '...' };
    const todayRain = weather.precipitation_sum[0];
    const tomorrowRain = weather.precipitation_sum[1];

    if (todayRain > 10 || tomorrowRain > 10) {
      return {
        status: 'Tunda Irigasi',
        color: 'text-blue-600',
        bg: 'bg-blue-100',
        advice: `Hujan diperkirakan turun (${todayRain}mm). Biarkan sawah menampung air hujan alami.`
      };
    } else {
      return {
        status: 'Perlu Irigasi',
        color: 'text-amber-600',
        bg: 'bg-amber-100',
        advice: 'Cuaca kering. Lakukan pengairan intermiten (AWD) untuk menghemat air.'
      };
    }
  };

  const advice = getIrrigationAdvice();

  return (
    <div className="p-4 pb-24 max-w-md mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Smart Irrigation (AWD)</h1>
        <p className="text-stone-500">Optimalkan penggunaan air sawah</p>
      </header>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-stone-200 rounded-2xl"></div>
          <div className="h-48 bg-stone-200 rounded-2xl"></div>
        </div>
      ) : weather && (
        <>
          <div className={`${advice.bg} rounded-2xl p-6 mb-6 shadow-sm`}>
            <div className="flex items-center gap-3 mb-2">
              <Droplets className={advice.color} />
              <h2 className={`text-lg font-bold ${advice.color}`}>{advice.status}</h2>
            </div>
            <p className="text-stone-700">{advice.advice}</p>
            <div className="mt-4 pt-4 border-t border-black/5 flex justify-between text-sm">
              <span className="text-stone-500">Penghematan Air</span>
              <span className="font-bold text-emerald-600">~15% bulan ini</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 mb-6">
            <h3 className="font-bold text-stone-900 mb-4 flex items-center gap-2">
              <CloudRain size={18} className="text-blue-500" />
              Curah Hujan 7 Hari Kedepan
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weather.time.map((t, i) => ({
                  date: format(new Date(t), 'dd/MM'),
                  rain: weather.precipitation_sum[i]
                }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="rain" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Curah Hujan (mm)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100 flex gap-3">
            <AlertTriangle className="text-orange-500 shrink-0" />
            <div>
              <h4 className="font-bold text-orange-800 text-sm">Fase Kritis: Pembungaan</h4>
              <p className="text-orange-700 text-xs mt-1">
                Tanaman Anda memasuki fase pembungaan dalam 3 hari. Pastikan sawah tergenang 2-5 cm. Jangan biarkan kering!
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const MapFeature = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [reports, setReports] = useState<DiseaseReport[]>([]);

  useEffect(() => {
    axios.get('/api/schedules').then(res => setSchedules(res.data)).catch(console.error);
    axios.get('/api/reports').then(res => setReports(res.data)).catch(console.error);
  }, []);

  return (
    <div className="relative h-[calc(100vh-80px)] w-full">
      <header className="absolute top-0 left-0 right-0 p-4 z-[1000] bg-white/80 backdrop-blur-md border-b border-stone-200 pointer-events-none">
        <h1 className="text-2xl font-bold text-stone-900">Peta Lahan</h1>
        <p className="text-stone-500">Sebaran sawah kelompok tani</p>
      </header>
      
      <MapContainer 
        center={[-6.2088, 106.8456]} 
        zoom={13} 
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {schedules.map((s) => {
          let poly: [number, number][] | undefined = undefined;
          try {
            if (s.polygon && s.polygon.length > 5) {
               poly = JSON.parse(s.polygon);
            }
          } catch(e){}

          return (
            <Fragment key={`sched-${s.id}`}>
              {poly && poly.length > 0 ? (
                <Polygon positions={poly} color="#10b981" fillColor="#10b981" fillOpacity={0.4}>
                  <Popup>
                    <div className="p-1">
                      <h3 className="font-bold text-base mb-1">{s.farmerName}</h3>
                      <div className="text-sm text-stone-600 mb-2">{s.variety} • {s.areaSize} Ha</div>
                      <div className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs font-medium">
                        Panen: {format(parseISO(s.harvestDate), 'dd MMM yyyy')}
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              ) : (
                s.lat && s.lng && (
                  <Marker position={[s.lat, s.lng]}>
                    <Popup>
                      <div className="p-1">
                        <h3 className="font-bold text-base mb-1">{s.farmerName}</h3>
                        <div className="text-sm text-stone-600 mb-2">{s.variety} • {s.areaSize} Ha</div>
                        <div className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs font-medium">
                          Panen: {format(parseISO(s.harvestDate), 'dd MMM yyyy')}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )
              )}
            </Fragment>
          );
        })}

        {reports.map(r => (
           <CircleMarker key={`rep-${r.id}`} center={[r.lat, r.lng]} radius={10} color="#ef4444" fillColor="#ef4444" fillOpacity={0.7}>
              <Popup>
                 <div className="p-1">
                   <h3 className="font-bold text-red-600 mb-1">{r.diseaseName}</h3>
                   <div className="text-sm text-stone-600">Pelapor: {r.farmerName}</div>
                   <div className="text-xs text-stone-400 mt-1">{format(parseISO(r.date), 'dd MMM yyyy')}</div>
                 </div>
              </Popup>
           </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

const LocationPicker = ({ formData, setFormData }: any) => {
  useMapEvents({
    click(e) {
      if (formData.drawingPolygon) {
        setFormData({ ...formData, polygon: [...formData.polygon, [e.latlng.lat, e.latlng.lng]] });
      } else {
        setFormData({ ...formData, lat: e.latlng.lat, lng: e.latlng.lng });
      }
    },
  });
  return (
    <>
      {!formData.drawingPolygon && formData.lat && <Marker position={[formData.lat, formData.lng]} />}
      {formData.drawingPolygon && formData.polygon.length > 0 && <Polygon positions={formData.polygon} color="#10b981" />}
    </>
  );
};

const CommunityFeature = ({ currentUser }: { currentUser: User }) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  
  // Form states
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    farmerName: currentUser.username,
    variety: 'Ciherang',
    plantingDate: format(new Date(), 'yyyy-MM-dd'),
    areaSize: 1,
    lat: currentUser.lat,
    lng: currentUser.lng,
    polygon: [] as [number, number][],
    drawingPolygon: false
  });

  const fetchData = async () => {
    try {
      const schedRes = await axios.get('/api/schedules');
      setSchedules(schedRes.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Calculate harvest date (approx 115 days for Ciherang)
    const harvestDate = format(addDays(parseISO(formData.plantingDate), 115), 'yyyy-MM-dd');
    await axios.post('/api/schedules', { ...formData, harvestDate });
    setShowForm(false);
    fetchData();
  };

  return (
    <div className="p-4 pb-24 max-w-md mx-auto">
      <header className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Komunitas Tani</h1>
          <p className="text-stone-500">Desa Sukamaju</p>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className="bg-stone-900 text-white p-2 rounded-full shadow-lg"
        >
          <Menu size={20} />
        </button>
      </header>

      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl mb-4">
          <h3 className="text-emerald-800 font-bold text-sm mb-1">Rekomendasi Tanam</h3>
          <p className="text-emerald-700 text-xs">
            Disarankan menanam varietas <strong>Inpari 32</strong> mulai tanggal <strong>15-20 Oktober</strong> untuk menghindari panen raya serentak.
          </p>
        </div>

        {schedules.map((s) => (
          <div key={s.id} className="bg-white p-4 rounded-xl shadow-sm border border-stone-100 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-stone-900">{s.farmerName}</h3>
              <p className="text-xs text-stone-500">{s.variety} • {s.areaSize} Ha</p>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-400">Panen</div>
              <div className="font-mono font-medium text-emerald-600">
                {format(parseISO(s.harvestDate), 'dd MMM')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="bg-white w-full max-w-sm rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">
                  Catat Jadwal Tanam
                </h3>
                <button onClick={() => setShowForm(false)}><X /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Nama Petani</label>
                  <input 
                    type="text" 
                    readOnly
                    className="w-full p-2 border border-stone-200 rounded-lg bg-stone-100 text-stone-500 cursor-not-allowed"
                    value={formData.farmerName}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Varietas</label>
                  <select 
                    className="w-full p-2 border border-stone-200 rounded-lg"
                    value={formData.variety}
                    onChange={e => setFormData({...formData, variety: e.target.value})}
                  >
                    <option>Ciherang</option>
                    <option>Inpari 32</option>
                    <option>Inpari 42</option>
                    <option>Mekongga</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Luas Lahan (Ha)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="w-full p-2 border border-stone-200 rounded-lg"
                    value={formData.areaSize}
                    onChange={e => setFormData({...formData, areaSize: parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-2"><MapPin size={16} /> Lokasi Lahan</span>
                    <button 
                      type="button" 
                      onClick={() => setFormData({...formData, drawingPolygon: !formData.drawingPolygon, polygon: []})}
                      className="text-xs text-indigo-600 font-medium"
                    >
                      {formData.drawingPolygon ? 'Ubah ke Titik' : 'Gambar Area (Polygon)'}
                    </button>
                  </label>
                  <div className="h-40 rounded-lg overflow-hidden border border-stone-200 z-0 relative">
                    <MapContainer center={[formData.lat, formData.lng]} zoom={13} scrollWheelZoom={false} className="h-full w-full">
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <LocationPicker 
                        formData={formData} 
                        setFormData={setFormData} 
                      />
                    </MapContainer>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs text-stone-500">
                      {formData.drawingPolygon ? 'Ketuk beberapa kali di peta batas sawah.' : 'Ketuk peta untuk menandai satu titik sawah Anda.'}
                    </p>
                    {formData.drawingPolygon && formData.polygon.length > 0 && (
                      <button type="button" onClick={() => setFormData({...formData, polygon: []})} className="text-xs text-red-500">Reset Area</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Tanggal Tanam
                  </label>
                  <input 
                    type="date" 
                    required
                    className="w-full p-2 border border-stone-200 rounded-lg"
                    value={formData.plantingDate}
                    onChange={e => setFormData({...formData, plantingDate: e.target.value})}
                  />
                </div>
                <button type="submit" className="w-full bg-stone-900 text-white py-3 rounded-xl font-medium">
                  Simpan
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('detect');
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('padismart_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('padismart_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('padismart_user');
  };

  if (!currentUser) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <main>
        {activeTab === 'detect' && <DetectionFeature currentUser={currentUser} onLogout={handleLogout} />}
        {activeTab === 'irrigation' && <IrrigationFeature />}
        {activeTab === 'map' && <MapFeature />}
        {activeTab === 'community' && <CommunityFeature currentUser={currentUser} />}
      </main>
      <Navigation activeTab={activeTab} setTab={setActiveTab} />
    </div>
  );
}
