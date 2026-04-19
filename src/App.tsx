/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  TrendingUp, 
  ShoppingCart, 
  Globe, 
  CheckCircle2, 
  AlertCircle,
  Download,
  FileSpreadsheet,
  RefreshCcw,
  Info,
  Settings2,
  Percent,
  Coins,
  Receipt,
  Database,
  Search,
  Plus,
  Trash2,
  Save,
  Calculator,
  LogIn,
  LogOut,
  User as UserIcon,
  Cloud,
  CloudOff
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Product, CalculationResult } from './types';
import { DEFAULT_CHANNELS } from './constants';
import { calculatePrices } from './lib/calculator';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  writeBatch,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';

const MOCK_PRODUCTS: Product[] = [
  { sku: 'CAM-BASIC-01', cost: 25.00, desiredMargin: 0.30 },
  { sku: 'CAL-JEANS-02', cost: 65.00, desiredMargin: 0.25 },
  { sku: 'TEN-SPORT-03', cost: 120.00, desiredMargin: 0.20 },
  { sku: 'ACC-WATCH-04', cost: 45.00, desiredMargin: 0.35 },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [archivedProducts, setArchivedProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [margin, setMargin] = useState<number>(20); // 20%
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<CalculationResult[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [manualSku, setManualSku] = useState('');
  const [manualCost, setManualCost] = useState('');
  const [manualMargin, setManualMargin] = useState('');
  const [activeMainTab, setActiveMainTab] = useState('pricing');
  const [activeResultsTab, setActiveResultsTab] = useState('table');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync
  useEffect(() => {
    if (!user) {
      // Load from localStorage if not logged in
      const saved = localStorage.getItem('roi_calculator_db');
      if (saved) {
        try {
          setArchivedProducts(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load database', e);
        }
      }
      return;
    }

    // Load from Firestore if logged in
    const q = query(collection(db, 'users', user.uid, 'products'), orderBy('sku'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const firestoreProducts = snapshot.docs.map(doc => doc.data() as Product);
      setArchivedProducts(firestoreProducts);
    }, (error) => {
      console.error("Firestore Error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Save to localStorage ONLY if not logged in
  useEffect(() => {
    if (!user) {
      localStorage.setItem('roi_calculator_db', JSON.stringify(archivedProducts));
    }
  }, [archivedProducts, user]);

  const migrateToCloud = async () => {
    if (!user || archivedProducts.length === 0) return;
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      archivedProducts.forEach((p) => {
        const productRef = doc(db, 'users', user.uid, 'products', p.sku);
        batch.set(productRef, {
          ...p,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      console.log("Migration complete");
    } catch (e) {
      console.error("Migration failed", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (file: File) => {
    setIsProcessing(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (jsonData.length === 0) {
          showNotification("A planilha está vazia ou em formato inválido.", "error");
          setIsProcessing(false);
          return;
        }

        const parsedProducts: Product[] = jsonData
          .map((row) => {
            const sku = String(row.sku || row.SKU || row.nome || row.Nome || row.Produto || row.produto || 'N/A');
            const cost = parseFloat(String(row.custo || row.Custo || row.price || row.Preço || row.preco || 0).replace(',', '.'));
            
            // Handle margin: if it's > 1 (e.g. 30), divide by 100. If it's <= 1 (e.g. 0.3), keep it.
            let rawMargin = row.margem || row.Margem || row.margin || row.Margin;
            let desiredMarginValue: number | undefined = undefined;
            
            if (rawMargin !== undefined) {
              const parsed = parseFloat(String(rawMargin).replace(',', '.'));
              if (!isNaN(parsed)) {
                desiredMarginValue = parsed > 1 ? parsed / 100 : parsed;
              }
            }

            return {
              sku,
              cost,
              desiredMargin: desiredMarginValue
            };
          })
          .filter((p) => p.cost > 0 && p.sku !== 'N/A');

        if (parsedProducts.length === 0) {
          showNotification("Nenhum produto válido encontrado. Verifique as colunas 'sku' e 'custo'.", "error");
          setIsProcessing(false);
          return;
        }

        setTimeout(() => {
          setProducts(parsedProducts);
          const calculated = calculatePrices(parsedProducts, channels, margin / 100);
          setResults(calculated);
          setIsProcessing(false);
          setActiveMainTab('pricing');
          showNotification(`${parsedProducts.length} produtos carregados com sucesso!`);
        }, 1000);
      } catch (error) {
        console.error('Erro ao processar arquivo:', error);
        showNotification("Erro ao ler o arquivo. Certifique-se que é um Excel (.xlsx ou .csv).", "error");
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleMarginChange = (val: number) => {
    setMargin(val);
    if (products.length > 0) {
      const calculated = calculatePrices(products, channels, val / 100);
      setResults(calculated);
    }
  };

  const handleChannelChange = (channelId: string, field: keyof typeof DEFAULT_CHANNELS[0], value: number) => {
    const updatedChannels = channels.map(c => 
      c.id === channelId ? { ...c, [field]: value } : c
    );
    setChannels(updatedChannels);
    if (products.length > 0) {
      const calculated = calculatePrices(products, updatedChannels, margin / 100);
      setResults(calculated);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const sanitizeForFirestore = (obj: any) => {
    const sanitized = { ...obj };
    Object.keys(sanitized).forEach(key => {
      if (sanitized[key] === undefined) {
        delete sanitized[key];
      }
    });
    return sanitized;
  };

  const saveToArchiveSingle = async (p: Product) => {
    if (archivedProducts.some(ap => ap.sku === p.sku)) {
      showNotification("Produto já está arquivado.");
      return;
    }
    
    setIsProcessing(true);
    try {
      if (user) {
        const productRef = doc(db, 'users', user.uid, 'products', p.sku);
        await setDoc(productRef, { ...sanitizeForFirestore(p), updatedAt: serverTimestamp() });
        showNotification(`Produto ${p.sku} salvo na nuvem!`);
      } else {
        const updated = [...archivedProducts, p];
        setArchivedProducts(updated);
        localStorage.setItem('roi_calculator_db', JSON.stringify(updated));
        showNotification(`Produto ${p.sku} salvo localmente!`, 'success');
      }
    } catch (e) {
      console.error("Save failed", e);
      showNotification("Erro ao salvar produto.", 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const saveToArchive = async () => {
    const newItems = products.filter(p => !archivedProducts.some(ap => ap.sku === p.sku));
    if (newItems.length > 0) {
      setIsProcessing(true);
      try {
        if (user) {
          // Save to Firestore
          const batch = writeBatch(db);
          newItems.forEach(p => {
            const productRef = doc(db, 'users', user.uid, 'products', p.sku);
            batch.set(productRef, { ...sanitizeForFirestore(p), updatedAt: serverTimestamp() });
          });
          await batch.commit();
          showNotification(`${newItems.length} produtos salvos na nuvem!`);
        } else {
          // Save to Local
          const updated = [...archivedProducts, ...newItems];
          setArchivedProducts(updated);
          localStorage.setItem('roi_calculator_db', JSON.stringify(updated));
          showNotification(`${newItems.length} produtos salvos localmente!`, 'success');
        }
      } catch (e) {
        console.error("Save failed", e);
        showNotification("Erro ao salvar produtos.", 'error');
      } finally {
        setIsProcessing(false);
      }
    } else {
      showNotification("Todos os produtos já estão arquivados.");
    }
  };

  const removeFromArchive = async (sku: string) => {
    if (user) {
      await deleteDoc(doc(db, 'users', user.uid, 'products', sku));
    } else {
      setArchivedProducts(archivedProducts.filter(p => p.sku !== sku));
    }
  };

  const selectFromArchive = (product: Product) => {
    if (!products.some(p => p.sku === product.sku)) {
      const newProducts = [...products, product];
      setProducts(newProducts);
      const calculated = calculatePrices(newProducts, channels, margin / 100);
      setResults(calculated);
    }
  };

  const handleManualAdd = () => {
    if (!manualSku || !manualCost) return;
    const cost = parseFloat(manualCost);
    const mgn = manualMargin ? parseFloat(manualMargin) / 100 : undefined;
    if (isNaN(cost)) return;

    const newProduct: Product = { sku: manualSku, cost, desiredMargin: mgn };
    const newProducts = [...products, newProduct];
    setProducts(newProducts);
    const calculated = calculatePrices(newProducts, channels, margin / 100);
    setResults(calculated);
    setManualSku('');
    setManualCost('');
    setManualMargin('');
  };

  const updateArchiveCost = async (sku: string, newCost: number) => {
    if (user) {
      await setDoc(doc(db, 'users', user.uid, 'products', sku), { cost: newCost }, { merge: true });
    } else {
      setArchivedProducts(prev => prev.map(p => 
        p.sku === sku ? { ...p, cost: newCost } : p
      ));
    }
  };

  const updateArchiveMargin = async (sku: string, newMargin: number) => {
    if (user) {
      await setDoc(doc(db, 'users', user.uid, 'products', sku), { desiredMargin: newMargin / 100 }, { merge: true });
    } else {
      setArchivedProducts(prev => prev.map(p => 
        p.sku === sku ? { ...p, desiredMargin: newMargin / 100 } : p
      ));
    }
  };

  const loadMockData = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setProducts(MOCK_PRODUCTS);
      const calculated = calculatePrices(MOCK_PRODUCTS, channels, margin / 100);
      setResults(calculated);
      setIsProcessing(false);
    }, 1500);
  };

  const exportDatabase = () => {
    if (archivedProducts.length === 0) return;
    
    const exportData = archivedProducts.map(p => ({
      SKU: p.sku,
      'Custo Unitário': p.cost,
      'Margem Desejada (%)': (p.desiredMargin !== undefined ? p.desiredMargin : margin / 100) * 100
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtos");
    XLSX.writeFile(wb, `Base_Produtos_Pietro_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const filteredArchive = useMemo(() => {
    return archivedProducts.filter(p => 
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [archivedProducts, searchTerm]);

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans selection:bg-pietro-orange/10">
      {/* Auth Bar */}
      <div className="w-full bg-white/50 backdrop-blur-md border-b border-neutral-100 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {user ? (
              <Badge variant="outline" className="bg-green-50 text-green-600 border-green-100 gap-1.5 py-1">
                <Cloud className="w-3 h-3" />
                Nuvem Ativa
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-neutral-50 text-neutral-400 border-neutral-100 gap-1.5 py-1">
                <CloudOff className="w-3 h-3" />
                Modo Local
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-[10px] font-bold text-neutral-900 leading-none">{user.displayName}</span>
                  <span className="text-[9px] text-neutral-400 leading-none mt-1">{user.email}</span>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-neutral-200" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-pietro-orange/10 flex items-center justify-center">
                    <UserIcon className="w-4 h-4 text-pietro-orange" />
                  </div>
                )}
                <Button variant="ghost" size="icon" onClick={logout} className="text-neutral-400 hover:text-red-500">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button 
                onClick={signInWithGoogle} 
                variant="outline" 
                size="sm" 
                className="gap-2 border-pietro-orange/20 text-pietro-orange hover:bg-pietro-orange/5"
              >
                <LogIn className="w-4 h-4" />
                Entrar com Google
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Background Gradient */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--color-pietro-orange)_0%,_transparent_50%),_radial-gradient(ellipse_at_bottom_left,_var(--color-pietro-blue)_0%,_transparent_50%)] opacity-5" />

      {/* Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border backdrop-blur-md ${
              notification.type === 'success' 
                ? 'bg-green-500/90 text-white border-green-400' 
                : 'bg-red-500/90 text-white border-red-400'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold text-sm">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="container mx-auto py-10 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center"
        >
          <div className="mb-6 relative">
            <div className="w-20 h-20 bg-pietro-orange rounded-full flex items-center justify-center shadow-lg shadow-pietro-orange/20">
              <Calculator className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-pietro-blue rounded-full border-4 border-white flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
          </div>

          <Badge variant="outline" className="mb-4 px-3 py-1 text-pietro-orange border-pietro-orange/20 bg-pietro-orange/5 font-bold">
            Pietro Embalagens • v1.4
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 text-neutral-900">
            Precificação <span className="text-pietro-orange">PEB</span>
          </h1>
          <p className="text-neutral-500 max-w-md mx-auto text-sm">
            Ferramenta profissional de cálculo de margem e ROI para a operação Pietro.
          </p>
          
          <div className="flex justify-center mt-8">
            <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full max-w-md">
              <TabsList className="grid w-full grid-cols-2 bg-neutral-100/80 p-1 rounded-xl border border-neutral-200/50 backdrop-blur-sm">
                <TabsTrigger value="pricing" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-pietro-orange">
                  <Calculator className="w-4 h-4 mr-2" />
                  Calculadora
                </TabsTrigger>
                <TabsTrigger value="database" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-pietro-blue">
                  <Database className="w-4 h-4 mr-2" />
                  Meus Produtos
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </motion.div>
      </header>

      <main className="container mx-auto px-4 pb-24 max-w-6xl">
        <AnimatePresence mode="wait">
          {activeMainTab === 'pricing' ? (
            <motion.div
              key="pricing-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Left Column: Inputs */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="border-none shadow-2xl shadow-neutral-200/50 bg-white overflow-hidden ring-1 ring-neutral-100">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-pietro-orange">
                      <FileSpreadsheet className="w-5 h-5" />
                      Entrada de Dados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Tabs defaultValue="upload" className="w-full">
                      <TabsList className="flex w-full mb-4 bg-neutral-100/50 p-1 rounded-lg">
                        <TabsTrigger value="upload" className="flex-1">Upload</TabsTrigger>
                        <TabsTrigger value="manual" className="flex-1">Manual</TabsTrigger>
                        <TabsTrigger value="search" className="flex-1">Base</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="upload" className="space-y-4">
                        <div
                          onDragOver={onDragOver}
                          onDragLeave={onDragLeave}
                          onDrop={onDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`
                            border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300
                            ${dragActive ? 'border-pietro-orange bg-pietro-orange/5' : 'border-neutral-200 hover:border-pietro-orange/30 hover:bg-neutral-50'}
                          `}
                        >
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                            className="hidden"
                            accept=".xlsx, .xls, .csv"
                          />
                          <Upload className={`w-8 h-8 mx-auto mb-2 transition-colors ${dragActive ? 'text-pietro-orange' : 'text-neutral-400'}`} />
                          <p className="text-sm font-semibold text-neutral-600">Arraste sua planilha</p>
                        </div>
                        <Button 
                          variant="outline" 
                          className="w-full text-xs"
                          onClick={loadMockData}
                          disabled={isProcessing}
                        >
                          <RefreshCcw className="w-3 h-3 mr-2" />
                          Usar Exemplo
                        </Button>

                        <div className="bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                          <h4 className="text-[10px] font-bold uppercase text-neutral-400 mb-2 flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            Layout da Planilha
                          </h4>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="flex flex-col">
                              <span className="font-bold text-neutral-600">Obrigatório:</span>
                              <span className="text-neutral-500">sku, custo</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-neutral-600">Opcional:</span>
                              <span className="text-neutral-500">margem</span>
                            </div>
                          </div>
                          <p className="text-[9px] text-neutral-400 mt-2 leading-tight">
                            * Use ponto ou vírgula para decimais. Margem pode ser 30 ou 0.3.
                          </p>
                        </div>
                      </TabsContent>

                      <TabsContent value="manual" className="space-y-4">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase font-bold text-neutral-400">SKU / Nome</Label>
                            <Input 
                              placeholder="Ex: Camiseta Branca" 
                              value={manualSku}
                              onChange={(e) => setManualSku(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase font-bold text-neutral-400">Custo (R$)</Label>
                              <Input 
                                type="number" 
                                placeholder="0.00" 
                                value={manualCost}
                                onChange={(e) => setManualCost(e.target.value)}
                                className="h-9"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase font-bold text-neutral-400">Margem (%)</Label>
                              <Input 
                                type="number" 
                                placeholder={`${margin}`} 
                                value={manualMargin}
                                onChange={(e) => setManualMargin(e.target.value)}
                                className="h-9"
                              />
                            </div>
                          </div>
                          <Button 
                            className="w-full bg-pietro-orange hover:bg-pietro-orange/90 text-white font-bold shadow-lg shadow-pietro-orange/20"
                            onClick={handleManualAdd}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar
                          </Button>
                        </div>
                      </TabsContent>

                      <TabsContent value="search" className="space-y-4">
                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                          <Input 
                            placeholder="Buscar SKU na base..." 
                            className="pl-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                          {filteredArchive.length > 0 ? (
                            filteredArchive.map((p) => (
                              <div key={p.sku} className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 border border-neutral-100 hover:border-orange-200 transition-colors group">
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold">{p.sku}</span>
                                  <span className="text-[10px] text-neutral-400">{formatCurrency(p.cost)}</span>
                                </div>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-orange-500"
                                  onClick={() => selectFromArchive(p)}
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              </div>
                            ))
                          ) : (
                            <p className="text-center text-xs text-neutral-400 py-4">Nenhum produto encontrado.</p>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                <Card className="border-none shadow-2xl shadow-neutral-200/50 bg-white overflow-hidden ring-1 ring-neutral-100">
                  <div className="h-1.5 bg-pietro-orange" />
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-pietro-orange">
                        <TrendingUp className="w-5 h-5" />
                        Configurações
                      </CardTitle>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setShowSettings(!showSettings)}
                      className={showSettings ? 'text-pietro-orange bg-pietro-orange/5' : 'text-neutral-400'}
                    >
                      <Settings2 className="w-5 h-5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-neutral-500 uppercase">Margem Desejada (%)</Label>
                      <div className="relative">
                        <Input 
                          type="number" 
                          value={isNaN(margin) ? '' : margin} 
                          onChange={(e) => handleMarginChange(parseFloat(e.target.value) || 0)}
                          className="h-12 text-2xl font-bold text-pietro-orange pr-10 border-pietro-orange/20 focus-visible:ring-pietro-orange"
                        />
                        <Percent className="w-6 h-6 absolute right-3 top-3 text-pietro-orange/30" />
                      </div>
                    </div>
                    
                    <AnimatePresence>
                      {showSettings && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden pt-4 space-y-4 border-t border-neutral-100"
                        >
                          {channels.map((channel) => (
                            <div key={channel.id} className="space-y-2 p-3 rounded-lg bg-neutral-50/50 border border-neutral-100">
                              <div className="flex items-center gap-2 mb-1">
                                <div className={`w-2 h-2 rounded-full ${channel.color}`} />
                                <span className="text-[10px] font-bold uppercase text-neutral-500">{channel.name}</span>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[9px] text-neutral-400 uppercase">Com%</Label>
                                  <Input 
                                    type="number" 
                                    value={isNaN(channel.commission) ? '' : channel.commission * 100} 
                                    onChange={(e) => handleChannelChange(channel.id, 'commission', (parseFloat(e.target.value) || 0) / 100)}
                                    className="h-7 text-[10px] px-1"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[9px] text-neutral-400 uppercase">Fixo R$</Label>
                                  <Input 
                                    type="number" 
                                    value={isNaN(channel.fixedFee) ? '' : channel.fixedFee} 
                                    onChange={(e) => handleChannelChange(channel.id, 'fixedFee', parseFloat(e.target.value) || 0)}
                                    className="h-7 text-[10px] px-1"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[9px] text-neutral-400 uppercase">Imp%</Label>
                                  <Input 
                                    type="number" 
                                    value={isNaN(channel.tax) ? '' : channel.tax * 100} 
                                    onChange={(e) => handleChannelChange(channel.id, 'tax', (parseFloat(e.target.value) || 0) / 100)}
                                    className="h-7 text-[10px] px-1"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[9px] text-neutral-400 uppercase">C.Fixo R$</Label>
                                  <Input 
                                    type="number" 
                                    value={isNaN(channel.extraFixedCost) ? '' : channel.extraFixedCost} 
                                    onChange={(e) => handleChannelChange(channel.id, 'extraFixedCost', parseFloat(e.target.value) || 0)}
                                    className="h-7 text-[10px] px-1"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[9px] text-neutral-400 uppercase">ADS%</Label>
                                  <Input 
                                    type="number" 
                                    value={isNaN(channel.ads) ? '' : channel.ads * 100} 
                                    onChange={(e) => handleChannelChange(channel.id, 'ads', (parseFloat(e.target.value) || 0) / 100)}
                                    className="h-7 text-[10px] px-1"
                                  />
                                </div>
                                {channel.id.startsWith('ml_') && (
                                  <div className="space-y-1">
                                    <Label className="text-[9px] text-neutral-400 uppercase">Frete R$</Label>
                                    <Input 
                                      type="number" 
                                      value={isNaN(channel.shippingCost || 0) ? '' : channel.shippingCost || 0} 
                                      onChange={(e) => handleChannelChange(channel.id, 'shippingCost', parseFloat(e.target.value) || 0)}
                                      className="h-7 text-[10px] px-1"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Results */}
              <div className="lg:col-span-2">
                <AnimatePresence mode="wait">
                  {isProcessing ? (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                      className="h-[500px] flex flex-col items-center justify-center p-12 bg-white/50 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 border-4 border-orange-100 border-t-orange-500 rounded-full mb-6"
                      />
                      <h3 className="text-xl font-bold mb-2">Calculando Preços...</h3>
                    </motion.div>
                  ) : results.length > 0 ? (
                    <motion.div
                      key="results"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold flex items-center gap-2 text-neutral-800">
                          <CheckCircle2 className="w-6 h-6 text-pietro-blue" />
                          Sugestões de Venda
                        </h2>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="text-xs h-9 border-pietro-blue/20 text-pietro-blue hover:bg-pietro-blue/5" onClick={saveToArchive}>
                            <Save className="w-3.5 h-3.5 mr-2" />
                            Arquivar Tudo
                          </Button>
                          <Button variant="ghost" size="sm" className="text-xs h-9 text-neutral-400" onClick={() => { setResults([]); setProducts([]); }}>
                            Limpar
                          </Button>
                        </div>
                      </div>

                      <Tabs value={activeResultsTab} onValueChange={setActiveResultsTab} className="w-full">
                        <TabsList className="flex w-full mb-6 bg-white p-1 rounded-xl border border-neutral-200 shadow-sm">
                          <TabsTrigger value="table" className="flex-1 rounded-lg py-3 data-[selected]:bg-white data-[selected]:text-pietro-orange data-[selected]:border-pietro-orange data-[selected]:border-2 transition-all">
                            <div className="flex items-center justify-center gap-2">
                              <ShoppingCart className="w-4 h-4" />
                              <span className="font-bold">Visão Geral</span>
                            </div>
                          </TabsTrigger>
                          <TabsTrigger value="cards" className="flex-1 rounded-lg py-3 data-[selected]:bg-white data-[selected]:text-pietro-orange data-[selected]:border-pietro-orange data-[selected]:border-2 transition-all">
                            <div className="flex items-center justify-center gap-2">
                              <TrendingUp className="w-4 h-4" />
                              <span className="font-bold">Detalhado por SKU</span>
                            </div>
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="table" className="mt-0">
                          <Card className="border-none shadow-xl shadow-neutral-200/50 overflow-hidden">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader className="bg-neutral-50">
                                  <TableRow>
                                    <TableHead className="font-bold min-w-[120px]">SKU</TableHead>
                                    <TableHead className="font-bold">Custo</TableHead>
                                    {channels.map(c => (
                                      <TableHead key={c.id} className="font-bold text-center min-w-[100px]">
                                        {c.name}
                                      </TableHead>
                                    ))}
                                    <TableHead className="font-bold text-right">Ação</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {results.map((res, idx) => (
                                    <TableRow key={idx} className="hover:bg-neutral-50/50 transition-colors">
                                      <TableCell className="font-medium text-xs truncate max-w-[150px]">{res.sku}</TableCell>
                                      <TableCell className="text-neutral-500 text-xs">{formatCurrency(res.cost)}</TableCell>
                                      {channels.map(c => (
                                        <TableCell key={c.id} className="text-center">
                                          <div className="flex flex-col">
                                            <span className="font-bold text-neutral-900 text-sm">
                                              {formatCurrency(res.channels[c.id].sellingPrice)}
                                            </span>
                                            <span className="text-[10px] text-green-600 font-medium">
                                              +{formatCurrency(res.channels[c.id].marginAmount)}
                                            </span>
                                          </div>
                                        </TableCell>
                                      ))}
                                      <TableCell className="text-right">
                                        {!archivedProducts.some(ap => ap.sku === res.sku) ? (
                                          <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-8 w-8 text-pietro-orange hover:bg-pietro-orange/10"
                                            onClick={() => {
                                              const p = products.find(prod => prod.sku === res.sku);
                                              if (p) saveToArchiveSingle(p);
                                            }}
                                            title="Salvar na Base"
                                          >
                                            <Save className="w-4 h-4" />
                                          </Button>
                                        ) : (
                                          <Badge variant="ghost" className="text-[10px] text-green-600 bg-green-50">Salvo</Badge>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </Card>
                        </TabsContent>

                        <TabsContent value="cards" className="space-y-6 mt-0">
                          <div className="grid grid-cols-1 gap-6">
                            {results.map((res, idx) => {
                              const firstChannelId = Object.keys(res.channels)[0];
                              const displayMargin = firstChannelId ? res.channels[firstChannelId].marginPercent : margin;
                              
                              return (
                                <Card key={idx} className="border-none shadow-xl shadow-neutral-200/50 overflow-hidden">
                                  <CardHeader className="bg-neutral-50/50 border-b border-neutral-100 py-4">
                                    <div className="flex justify-between items-center">
                                      <div>
                                        <CardTitle className="text-base">{res.sku}</CardTitle>
                                        <CardDescription className="text-xs">Custo: {formatCurrency(res.cost)}</CardDescription>
                                      </div>
                                      <Badge variant="secondary" className="bg-white text-[10px] border border-neutral-100">
                                        {displayMargin}% Margem
                                      </Badge>
                                    </div>
                                  </CardHeader>
                                  <CardContent className="p-0">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-neutral-100">
                                      {channels.map(c => {
                                        const data = res.channels[c.id];
                                        if (!data) return null;
                                        
                                        return (
                                          <div key={c.id} className="p-4 space-y-3 hover:bg-neutral-50/30 transition-colors">
                                            <div className="flex items-center gap-2">
                                              <div className={`w-2 h-2 rounded-full ${c.color}`} />
                                              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                                {c.name}
                                              </span>
                                            </div>
                                            <div>
                                              <p className="text-[10px] text-neutral-400">Venda Sugerida</p>
                                              <p className="text-xl font-black text-pietro-orange">
                                                {formatCurrency(data.sellingPrice)}
                                              </p>
                                            </div>
                                            <div className="space-y-1 pt-2 border-t border-neutral-50">
                                              <div className="flex justify-between text-[10px]">
                                                <span className="text-neutral-400">Taxas</span>
                                                <span className="text-red-400">-{formatCurrency(data.fees)}</span>
                                              </div>
                                              <div className="flex justify-between text-[10px]">
                                                <span className="text-neutral-400">Impostos</span>
                                                <span className="text-red-400">-{formatCurrency(data.taxes)}</span>
                                              </div>
                                              <div className="flex justify-between text-[10px]">
                                                <span className="text-neutral-400">ADS</span>
                                                <span className="text-red-400">-{formatCurrency(data.adsAmount)}</span>
                                              </div>
                                              <div className="flex justify-between text-[10px]">
                                                <span className="text-neutral-400">Embalagem/Fixo</span>
                                                <span className="text-red-400">-{formatCurrency(data.extraFixedAmount)}</span>
                                              </div>
                                              <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-neutral-50 mt-1">
                                                <span className="text-neutral-600">Lucro Líquido</span>
                                                <span className="text-green-600">+{formatCurrency(data.marginAmount)}</span>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            })}
                          </div>
                        </TabsContent>
                      </Tabs>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-[500px] flex flex-col items-center justify-center p-12 border-2 border-dashed border-neutral-200 rounded-3xl bg-white/30"
                    >
                      <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
                        <ShoppingCart className="w-8 h-8 text-neutral-300" />
                      </div>
                      <h3 className="text-lg font-bold text-neutral-400 mb-2">Aguardando entrada...</h3>
                      <p className="text-neutral-400 text-center max-w-xs text-xs">
                        Importe uma planilha ou selecione produtos da sua base de dados para começar.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="database-tab"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Database className="w-6 h-6 text-orange-500" />
                    Base de Dados {user ? 'na Nuvem' : 'Local'}
                  </h2>
                  <p className="text-neutral-500 text-sm">
                    {user 
                      ? 'Seus produtos estão salvos com segurança na sua conta Google.' 
                      : 'Seus produtos estão salvos apenas neste navegador. Entre para sincronizar.'}
                  </p>
                </div>
                  <div className="flex items-center gap-2">
                    {user && archivedProducts.length > 0 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-xs h-9 border-pietro-blue/30 text-pietro-blue hover:bg-pietro-blue/5"
                        onClick={migrateToCloud}
                        disabled={isProcessing}
                      >
                        <RefreshCcw className={`w-4 h-4 mr-2 ${isProcessing ? 'animate-spin' : ''}`} />
                        Sincronizar Local
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-9 border-neutral-200"
                      onClick={exportDatabase}
                      disabled={archivedProducts.length === 0}
                    >
                      <Download className="w-4 h-4 mr-2 text-neutral-500" />
                      Exportar Excel
                    </Button>
                    <div className="relative w-full md:w-72">
                      <Search className="w-4 h-4 absolute left-3 top-3 text-neutral-400" />
                      <Input 
                        placeholder="Pesquisar SKU..." 
                        className="pl-9 bg-white"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
              </div>

              <Card className="border-none shadow-xl shadow-neutral-200/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-neutral-50">
                      <TableRow>
                        <TableHead className="font-bold">SKU</TableHead>
                        <TableHead className="font-bold">Custo Unitário</TableHead>
                        <TableHead className="font-bold">Margem (%)</TableHead>
                        {channels.map(c => (
                          <TableHead key={c.id} className="font-bold text-center text-[10px] uppercase min-w-[100px]">
                            {c.name}
                          </TableHead>
                        ))}
                        <TableHead className="font-bold text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredArchive.length > 0 ? (
                        filteredArchive.map((p) => {
                          const productMargin = p.desiredMargin !== undefined ? p.desiredMargin * 100 : margin;
                          const calc = calculatePrices([p], channels, productMargin / 100)[0];
                          return (
                            <TableRow key={p.sku} className="hover:bg-neutral-50/50 transition-colors">
                              <TableCell className="font-medium text-xs">{p.sku}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 max-w-[120px]">
                                  <span className="text-neutral-400 text-[10px] font-bold">R$</span>
                                  <Input 
                                    type="number" 
                                    value={p.cost} 
                                    onChange={(e) => updateArchiveCost(p.sku, parseFloat(e.target.value) || 0)}
                                    className="h-8 text-xs focus-visible:ring-pietro-orange"
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 max-w-[100px]">
                                  <Input 
                                    type="number" 
                                    value={productMargin} 
                                    onChange={(e) => updateArchiveMargin(p.sku, parseFloat(e.target.value) || 0)}
                                    className="h-8 text-xs focus-visible:ring-pietro-orange"
                                  />
                                  <span className="text-neutral-400 text-[10px] font-bold">%</span>
                                </div>
                              </TableCell>
                              {channels.map(c => (
                                <TableCell key={c.id} className="text-center">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-pietro-orange text-xs">
                                      {formatCurrency(calc.channels[c.id].sellingPrice)}
                                    </span>
                                    <span className="text-[9px] text-green-600">
                                      Lucro: {formatCurrency(calc.channels[c.id].marginAmount)}
                                    </span>
                                  </div>
                                </TableCell>
                              ))}
                              <TableCell className="text-right space-x-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-pietro-orange hover:text-pietro-orange hover:bg-pietro-orange/5"
                                  onClick={() => {
                                    selectFromArchive(p);
                                    setActiveMainTab('pricing');
                                  }}
                                  title="Precificar"
                                >
                                  <Calculator className="w-4 h-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-50"
                                  onClick={() => removeFromArchive(p.sku)}
                                  title="Remover"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3 + channels.length} className="text-center py-12 text-neutral-400">
                            Nenhum produto na sua base de dados ainda.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="container mx-auto py-12 px-4 border-t border-neutral-100 text-center text-neutral-400 text-xs">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center grayscale opacity-50">
            <Calculator className="w-6 h-6" />
          </div>
          <p>© 2024 Precificação PEB • Pietro Embalagens</p>
        </div>
      </footer>
    </div>
  );
}
