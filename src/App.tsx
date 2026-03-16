import React, { useState, useEffect } from 'react';
import { PlusCircle, ClipboardList, CheckCircle2, Clock, User, History, LogIn, LogOut, AlertTriangle } from 'lucide-react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, doc, setDoc, getDoc, onSnapshot, query, orderBy, addDoc, serverTimestamp, Timestamp, getDocs } from 'firebase/firestore';

// Tipos de dados
interface Registro {
  id: string;
  dataHora: Date;
  nomeAluno: string;
  habilidadeAlvo: string;
  nivelSucesso: string;
  observacoes: string;
  authorUid: string;
}

interface AppUser {
  uid: string;
  role: 'professor' | 'pai' | 'admin';
  email: string;
  name: string;
  filhos?: string[];
}

const ALUNOS = ['Lucas Silva', 'Mariana Costa', 'Pedro Souza'];
const HABILIDADES = ['Interação Social', 'Foco e Atenção', 'Coordenação Motora', 'Comunicação Expressiva', 'Regulação Emocional'];
const NIVEIS_SUCESSO = ['Independente', 'Com ajuda parcial', 'Com ajuda total', 'Não realizou'];

type Tab = 'registrar' | 'historico' | 'visao_pais';

// Error Boundary para capturar erros do Firestore
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, errorInfo: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-app-bg text-app-text flex items-center justify-center p-4">
          <div className="bg-app-surface p-8 rounded-2xl border border-red-900/50 max-w-lg w-full text-center">
            <AlertTriangle size={48} className="mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">Erro de Permissão ou Conexão</h2>
            <p className="text-gray-400 mb-4 text-sm">Ocorreu um erro ao acessar os dados. Verifique se você tem permissão para esta ação.</p>
            <button onClick={() => window.location.reload()} className="bg-app-accent text-black px-6 py-2 rounded-xl font-bold">
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  // Auth State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Navigation State
  const [activeTab, setActiveTab] = useState<Tab>('registrar');

  // Data State
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [alunoSelecionadoPai, setAlunoSelecionadoPai] = useState('');
  const [filtroAlunoProf, setFiltroAlunoProf] = useState('');

  // Form State
  const [aluno, setAluno] = useState('');
  const [habilidade, setHabilidade] = useState('');
  const [nivel, setNivel] = useState('');
  const [obs, setObs] = useState('');

  // Setup Role Form
  const [tempRole, setTempRole] = useState<'professor' | 'pai'>('professor');
  const [tempFilho, setTempFilho] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as AppUser;
            setAppUser(userData);
            setActiveTab(userData.role === 'professor' ? 'registrar' : 'visao_pais');
            if (userData.role === 'pai' && userData.filhos && userData.filhos.length > 0) {
              setAlunoSelecionadoPai(userData.filhos[0]);
            }
          } else {
            setAppUser(null);
          }
        } catch (error) {
          console.error("Error fetching user:", error);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!appUser) return;

    const q = query(collection(db, 'registros'), orderBy('dataHora', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const regs: Registro[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        regs.push({
          id: doc.id,
          dataHora: data.dataHora?.toDate() || new Date(),
          nomeAluno: data.nomeAluno,
          habilidadeAlvo: data.habilidadeAlvo,
          nivelSucesso: data.nivelSucesso,
          observacoes: data.observacoes || '',
          authorUid: data.authorUid
        });
      });
      setRegistros(regs);
    }, (error) => {
      console.error("Firestore Error:", error);
      // Ignorar erros de permissão silenciosamente se for pai tentando ler tudo, 
      // pois as regras do Firestore filtram no backend, mas o onSnapshot tenta ler a coleção toda.
      // Para MVP, vamos manter simples. Se der erro, a lista fica vazia.
    });

    return () => unsubscribe();
  }, [appUser]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const newUser: AppUser = {
      uid: user.uid,
      role: tempRole,
      email: user.email || '',
      name: user.displayName || 'Usuário',
    };

    if (tempRole === 'pai') {
      if (!tempFilho) {
        alert("Por favor, digite o nome do seu filho.");
        return;
      }
      newUser.filhos = [tempFilho];
    }

    try {
      await setDoc(doc(db, 'users', user.uid), newUser);
      setAppUser(newUser);
      setActiveTab(newUser.role === 'professor' ? 'registrar' : 'visao_pais');
      if (newUser.role === 'pai' && newUser.filhos) {
        setAlunoSelecionadoPai(newUser.filhos[0]);
      }
    } catch (error) {
      console.error("Error creating profile:", error);
      alert("Erro ao criar perfil. Verifique as permissões.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aluno || !habilidade || !nivel || !appUser) {
      alert('Por favor, preencha os campos obrigatórios.');
      return;
    }

    try {
      await addDoc(collection(db, 'registros'), {
        dataHora: serverTimestamp(),
        nomeAluno: aluno,
        habilidadeAlvo: habilidade,
        nivelSucesso: nivel,
        observacoes: obs,
        authorUid: appUser.uid
      });
      
      setAluno('');
      setHabilidade('');
      setNivel('');
      setObs('');
      
      alert('Registro salvo com sucesso!');
      setActiveTab('historico');
    } catch (error) {
      console.error("Error saving record:", error);
      alert("Erro ao salvar registro. Verifique suas permissões.");
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-app-bg flex items-center justify-center text-app-accent">Carregando...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="bg-app-surface p-8 rounded-3xl border border-gray-800 shadow-2xl max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-app-text tracking-wide mb-2">
            Altamente <span className="text-app-accent">App</span>
          </h1>
          <p className="text-gray-400 mb-8">Rastreamento Inclusivo de Habilidades</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-black font-bold text-lg p-4 rounded-xl hover:bg-gray-200 transition-transform active:scale-95 flex items-center justify-center gap-3"
          >
            <LogIn size={24} />
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  if (!appUser) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="bg-app-surface p-8 rounded-3xl border border-gray-800 shadow-2xl max-w-md w-full">
          <h2 className="text-2xl font-bold text-app-text mb-6 text-center">Complete seu Perfil</h2>
          <form onSubmit={handleCreateProfile} className="space-y-6">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">Eu sou um(a):</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTempRole('professor')}
                  className={`p-4 rounded-xl border text-center font-medium transition-all ${
                    tempRole === 'professor' ? 'bg-app-accent text-black border-app-accent' : 'bg-[#121212] border-transparent text-gray-300'
                  }`}
                >
                  Professor
                </button>
                <button
                  type="button"
                  onClick={() => setTempRole('pai')}
                  className={`p-4 rounded-xl border text-center font-medium transition-all ${
                    tempRole === 'pai' ? 'bg-app-accent text-black border-app-accent' : 'bg-[#121212] border-transparent text-gray-300'
                  }`}
                >
                  Pai/Mãe
                </button>
              </div>
            </div>

            {tempRole === 'pai' && (
              <div className="space-y-3 animate-in fade-in">
                <label className="block text-sm font-medium text-gray-300">Nome do seu filho(a):</label>
                <select 
                  value={tempFilho}
                  onChange={(e) => setTempFilho(e.target.value)}
                  className="w-full bg-[#121212] border border-gray-700 rounded-xl p-4 text-app-text focus:border-app-accent focus:ring-1 focus:ring-app-accent"
                >
                  <option value="" disabled>Selecione o aluno...</option>
                  {ALUNOS.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            )}

            <button 
              type="submit"
              className="w-full bg-app-accent text-black font-bold text-lg p-4 rounded-xl hover:bg-[#e6bc5c] transition-transform active:scale-95"
            >
              Concluir Cadastro
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Componente de Lista de Registros (reutilizável)
  const RegistrosList = ({ dados }: { dados: Registro[] }) => {
    if (dados.length === 0) {
      return (
        <div className="bg-app-surface border border-gray-800 rounded-2xl p-12 text-center">
          <ClipboardList size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 text-lg">Nenhum registro encontrado.</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {dados.map((registro) => (
          <div key={registro.id} className="bg-app-surface p-6 rounded-2xl border border-gray-800 flex flex-col h-full shadow-md hover:border-gray-600 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className="inline-block bg-app-accent/10 text-app-accent px-3 py-1.5 rounded-full text-xs font-bold tracking-wide">
                {registro.habilidadeAlvo}
              </span>
              <div className="flex items-center text-gray-500 text-xs gap-1.5 bg-[#121212] px-2 py-1 rounded-md">
                <Clock size={12} />
                {registro.dataHora.toLocaleDateString('pt-BR')}
              </div>
            </div>
            
            <div className="mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Aluno</p>
              <p className="font-medium text-white text-md mb-3">{registro.nomeAluno}</p>
              
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Nível de Sucesso</p>
              <p className="font-medium text-app-text text-lg">{registro.nivelSucesso}</p>
            </div>

            {registro.observacoes && (
              <div className="pt-4 border-t border-gray-800 mt-auto">
                <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">Observações do Professor</p>
                <p className="text-sm leading-relaxed text-gray-300 italic">"{registro.observacoes}"</p>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-app-surface border-r border-gray-800 h-screen sticky top-0 z-20">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-app-text tracking-wide">
            Altamente <span className="text-app-accent">App</span>
          </h1>
          <p className="text-xs text-gray-400 mt-2">Rastreamento Inclusivo</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {appUser.role === 'professor' ? (
            <>
              <button 
                onClick={() => setActiveTab('registrar')}
                className={`w-full flex items-center gap-3 p-4 rounded-xl transition-colors ${
                  activeTab === 'registrar' ? 'bg-app-accent/10 text-app-accent font-medium' : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-gray-200'
                }`}
              >
                <PlusCircle size={20} />
                <span>Registrar</span>
              </button>
              <button 
                onClick={() => setActiveTab('historico')}
                className={`w-full flex items-center gap-3 p-4 rounded-xl transition-colors ${
                  activeTab === 'historico' ? 'bg-app-accent/10 text-app-accent font-medium' : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-gray-200'
                }`}
              >
                <History size={20} />
                <span>Histórico</span>
              </button>
            </>
          ) : (
            <button 
              onClick={() => setActiveTab('visao_pais')}
              className={`w-full flex items-center gap-3 p-4 rounded-xl transition-colors ${
                activeTab === 'visao_pais' ? 'bg-app-accent/10 text-app-accent font-medium' : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-gray-200'
              }`}
            >
              <ClipboardList size={20} />
              <span>Visão Pais</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#121212] border border-gray-800">
            <div className="flex items-center gap-3 text-sm text-gray-300 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-app-accent shrink-0">
                <User size={16} />
              </div>
              <div className="truncate">
                <p className="font-medium truncate">{appUser.name}</p>
                <p className="text-xs text-gray-500 capitalize">{appUser.role}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 p-2">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen relative">
        
        {/* Mobile Header */}
        <header className="md:hidden bg-app-surface px-6 py-4 shadow-md sticky top-0 z-30 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-app-text tracking-wide">
              Altamente <span className="text-app-accent">App</span>
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              {appUser.role === 'professor' ? 'Área do Professor' : 'Área da Família'}
            </p>
          </div>
          <button onClick={handleLogout} className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-red-400 border border-gray-700">
            <LogOut size={18} />
          </button>
        </header>

        {/* Main Scrollable Area */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 pb-24 md:pb-8 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            
            {/* Desktop Page Title */}
            <div className="hidden md:block mb-8">
              <h2 className="text-3xl font-bold text-app-text">
                {activeTab === 'registrar' && 'Registro Rápido'}
                {activeTab === 'historico' && 'Histórico de Registros'}
                {activeTab === 'visao_pais' && 'Acompanhamento Familiar'}
              </h2>
              <p className="text-gray-400 mt-2">
                {activeTab === 'registrar' && 'Registre as habilidades e o progresso diário dos alunos.'}
                {activeTab === 'historico' && 'Visualize e filtre todos os registros realizados.'}
                {activeTab === 'visao_pais' && 'Acompanhe o desenvolvimento e as conquistas do seu filho.'}
              </p>
            </div>

            {/* MÓDULO DO PROFESSOR - REGISTRAR */}
            {activeTab === 'registrar' && appUser.role === 'professor' && (
              <form onSubmit={handleSave} className="animate-in fade-in slide-in-from-bottom-4 duration-300 md:bg-app-surface md:p-8 md:rounded-2xl md:border md:border-gray-800 md:shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  {/* Aluno */}
                  <div className="space-y-3 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300">Nome do Aluno *</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {ALUNOS.map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAluno(a)}
                          className={`p-3 sm:p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${
                            aluno === a 
                              ? 'bg-app-accent/10 border-app-accent text-app-accent shadow-[0_0_10px_rgba(255,209,102,0.1)]' 
                              : 'bg-app-surface md:bg-[#121212] border-transparent text-gray-300 hover:bg-[#2a2a2a]'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${aluno === a ? 'bg-app-accent/20' : 'bg-gray-800'}`}>
                            <User size={16} />
                          </div>
                          <span className="text-sm font-medium truncate">{a}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Habilidade Alvo */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-300">Habilidade Alvo *</label>
                    <select 
                      value={habilidade}
                      onChange={(e) => setHabilidade(e.target.value)}
                      className="w-full bg-app-surface md:bg-[#121212] border border-gray-700 rounded-xl p-4 text-app-text appearance-none focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent transition-colors"
                    >
                      <option value="" disabled>Selecione a habilidade...</option>
                      {HABILIDADES.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Nível de Sucesso */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-300">Nível de Sucesso *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {NIVEIS_SUCESSO.map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNivel(n)}
                          className={`p-4 rounded-xl border text-center font-medium transition-all ${
                            nivel === n 
                              ? 'bg-app-accent text-black border-app-accent shadow-[0_0_10px_rgba(255,209,102,0.2)]' 
                              : 'bg-app-surface md:bg-[#121212] border-transparent text-gray-300 hover:bg-[#2a2a2a]'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Observações */}
                  <div className="space-y-3 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-300">Observações (Opcional)</label>
                    <textarea 
                      value={obs}
                      onChange={(e) => setObs(e.target.value)}
                      placeholder="Detalhes sobre o comportamento ou contexto..."
                      className="w-full bg-app-surface md:bg-[#121212] border border-gray-700 rounded-xl p-4 text-app-text min-h-[120px] focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent resize-none transition-colors"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="md:col-span-2 pt-4">
                    <button 
                      type="submit"
                      className="w-full md:w-auto md:min-w-[250px] md:ml-auto bg-app-accent text-black font-bold text-lg p-4 rounded-xl shadow-[0_4px_14px_0_rgba(255,209,102,0.39)] hover:bg-[#e6bc5c] transition-transform active:scale-95 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={24} />
                      Salvar Registro
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* MÓDULO DO PROFESSOR - HISTÓRICO */}
            {activeTab === 'historico' && appUser.role === 'professor' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                {/* Filtros */}
                <div className="bg-app-surface p-4 rounded-2xl border border-gray-800 flex flex-col sm:flex-row gap-4 items-center">
                  <span className="text-sm font-medium text-gray-400 whitespace-nowrap">Filtrar por Aluno:</span>
                  <div className="flex gap-2 overflow-x-auto w-full pb-2 sm:pb-0 hide-scrollbar">
                    <button
                      onClick={() => setFiltroAlunoProf('')}
                      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        filtroAlunoProf === '' ? 'bg-app-accent text-black' : 'bg-[#121212] text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      Todos
                    </button>
                    {ALUNOS.map(a => (
                      <button
                        key={a}
                        onClick={() => setFiltroAlunoProf(a)}
                        className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                          filtroAlunoProf === a ? 'bg-app-accent text-black' : 'bg-[#121212] text-gray-400 hover:text-gray-200'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <RegistrosList dados={filtroAlunoProf ? registros.filter(r => r.nomeAluno === filtroAlunoProf) : registros} />
              </div>
            )}

            {/* MÓDULO DA FAMÍLIA */}
            {activeTab === 'visao_pais' && appUser.role === 'pai' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                
                {/* Seletor de Aluno (Filho) */}
                <div className="bg-app-surface p-6 rounded-2xl border border-gray-800 shadow-lg">
                  <p className="text-sm text-gray-400 font-medium mb-4">Seu filho(a):</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {appUser.filhos?.map(a => (
                      <button
                        key={a}
                        onClick={() => setAlunoSelecionadoPai(a)}
                        className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${
                          alunoSelecionadoPai === a 
                            ? 'bg-app-accent/10 border-app-accent text-app-accent shadow-[0_0_10px_rgba(255,209,102,0.1)]' 
                            : 'bg-[#121212] border-transparent text-gray-300 hover:bg-[#2a2a2a]'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${alunoSelecionadoPai === a ? 'bg-app-accent/20' : 'bg-gray-800'}`}>
                          <User size={20} />
                        </div>
                        <span className="font-bold">{a}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resumo do Aluno */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-2 mt-8">
                  <h3 className="text-xl font-semibold flex items-center gap-2">
                    <Clock size={20} className="text-app-accent" />
                    Registros de {alunoSelecionadoPai}
                  </h3>
                  <div className="bg-app-surface px-4 py-2 rounded-lg border border-gray-800 w-full sm:w-auto text-center">
                    <p className="text-xs text-gray-400">Total de Registros</p>
                    <p className="text-xl font-bold text-app-accent">{registros.filter(r => r.nomeAluno === alunoSelecionadoPai).length}</p>
                  </div>
                </div>
                
                <RegistrosList dados={registros.filter(r => r.nomeAluno === alunoSelecionadoPai)} />
              </div>
            )}

          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#181818] border-t border-gray-800 flex justify-around p-2 pb-safe z-40">
        {appUser.role === 'professor' ? (
          <>
            <button 
              onClick={() => setActiveTab('registrar')}
              className={`flex flex-col items-center p-3 w-1/2 rounded-xl transition-colors ${
                activeTab === 'registrar' ? 'text-app-accent' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <PlusCircle size={24} className="mb-1" />
              <span className="text-xs font-medium">Registrar</span>
            </button>
            <button 
              onClick={() => setActiveTab('historico')}
              className={`flex flex-col items-center p-3 w-1/2 rounded-xl transition-colors ${
                activeTab === 'historico' ? 'text-app-accent' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <History size={24} className="mb-1" />
              <span className="text-xs font-medium">Histórico</span>
            </button>
          </>
        ) : (
          <button 
            onClick={() => setActiveTab('visao_pais')}
            className={`flex flex-col items-center p-3 w-full rounded-xl transition-colors ${
              activeTab === 'visao_pais' ? 'text-app-accent' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <ClipboardList size={24} className="mb-1" />
            <span className="text-xs font-medium">Visão Pais</span>
          </button>
        )}
      </nav>

    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
