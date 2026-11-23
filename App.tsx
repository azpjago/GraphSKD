import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as ImagePicker from 'expo-image-picker';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

type KategoriSKD = 'TIU' | 'TWK' | 'TKP';

interface SubFolder {
  id: string;
  kategori: KategoriSKD;
  nama: string;
  createdAt: number;
}

interface InfografisCard {
  id: string;
  folderId: string;
  kategori: KategoriSKD;
  judul: string;
  uri: string;
  mastered: boolean;
  createdAt: number;
}

const FOLDERS_KEY = '@graphskd_folders_v1';
const CARDS_KEY = '@graphskd_cards_v1';

// Folder awal bawaan agar langsung siap pakai (bisa ditambah/ubah/hapus bebas di aplikasi)
const DEFAULT_FOLDERS: SubFolder[] = [
  { id: 'f-tiu-1', kategori: 'TIU', nama: 'Penalaran Logis (Silogisme)', createdAt: 1 },
  { id: 'f-tiu-2', kategori: 'TIU', nama: 'Penalaran Analitis & Numerik', createdAt: 2 },
  { id: 'f-twk-1', kategori: 'TWK', nama: 'Nasionalisme & Bela Negara', createdAt: 3 },
  { id: 'f-twk-2', kategori: 'TWK', nama: 'Pilar Negara & UUD 1945', createdAt: 4 },
  { id: 'f-tkp-1', kategori: 'TKP', nama: 'Pelayanan Publik & Jejaring', createdAt: 5 },
  { id: 'f-tkp-2', kategori: 'TKP', nama: 'Profesionalisme & Anti Radikalisme', createdAt: 6 },
];

export default function App() {
  const [selectedKategori, setSelectedKategori] = useState<KategoriSKD>('TIU');
  const [folders, setFolders] = useState<SubFolder[]>([]);
  const [cards, setCards] = useState<InfografisCard[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [onlyNeedReview, setOnlyNeedReview] = useState(false);

  // State Modal Buat / Edit Folder
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<SubFolder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');

  // State Modal Tambah / Edit Judul Infografis
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<InfografisCard | null>(null);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [cardTitleInput, setCardTitleInput] = useState('');

  // State Fullscreen Landscape Viewer
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [showHud, setShowHud] = useState(true);

  // Muat data folder & infografis dari penyimpanan Android
  useEffect(() => {
    const loadData = async () => {
      try {
        const rawFolders = await AsyncStorage.getItem(FOLDERS_KEY);
        const rawCards = await AsyncStorage.getItem(CARDS_KEY);

        if (rawFolders) {
          setFolders(JSON.parse(rawFolders));
        } else {
          setFolders(DEFAULT_FOLDERS);
          await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(DEFAULT_FOLDERS));
        }

        if (rawCards) {
          setCards(JSON.parse(rawCards));
        }
      } catch (e) {
        console.warn('Gagal memuat data lokal:', e);
      }
    };
    loadData();
  }, []);

  const saveFolders = async (next: SubFolder[]) => {
    setFolders(next);
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(next));
  };

  const saveCards = async (next: InfografisCard[]) => {
    setCards(next);
    await AsyncStorage.setItem(CARDS_KEY, JSON.stringify(next));
  };

  // --- AKSI FOLDER SUB-MATERI ---
  const openCreateFolder = () => {
    setEditingFolder(null);
    setFolderNameInput('');
    setFolderModalVisible(true);
  };

  const openRenameFolder = (folder: SubFolder) => {
    setEditingFolder(folder);
    setFolderNameInput(folder.nama);
    setFolderModalVisible(true);
  };

  const handleSaveFolder = async () => {
    const trimmed = folderNameInput.trim();
    if (!trimmed) return;

    if (editingFolder) {
      const updated = folders.map((f) =>
        f.id === editingFolder.id ? { ...f, nama: trimmed } : f
      );
      await saveFolders(updated);
    } else {
      const newFolder: SubFolder = {
        id: `folder-${Date.now()}`,
        kategori: selectedKategori,
        nama: trimmed,
        createdAt: Date.now(),
      };
      await saveFolders([...folders, newFolder]);
    }
    setFolderModalVisible(false);
  };

  const handleDeleteFolder = (folder: SubFolder) => {
    const count = cards.filter((c) => c.folderId === folder.id).length;
    Alert.alert(
      'Hapus Folder Sub-Materi?',
      `Folder "${folder.nama}" beserta ${count} infografis di dalamnya akan dihapus dari daftar.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            await saveFolders(folders.filter((f) => f.id !== folder.id));
            await saveCards(cards.filter((c) => c.folderId !== folder.id));
            if (activeFolderId === folder.id) setActiveFolderId(null);
          },
        },
      ]
    );
  };

  // --- AKSI IMPORT & KELOLA INFOGRAFIS ---
  const handlePickInfografis = async () => {
    if (!activeFolderId) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Izin Galeri Diperlukan',
        'Aktifkan izin akses foto/media agar bisa memilih gambar infografis dari HP.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) return;

    const currentFolder = folders.find((f) => f.id === activeFolderId);
    const existingCount = cards.filter((c) => c.folderId === activeFolderId).length;

    // Jika pilih 1 gambar: buka modal agar bisa langsung beri judul spesifik
    if (result.assets.length === 1) {
      setEditingCard(null);
      setPendingUri(result.assets[0].uri);
      setCardTitleInput(
        `${currentFolder?.nama ?? 'Materi'} #${existingCount + 1}`
      );
      setCardModalVisible(true);
      return;
    }

    // Jika pilih banyak gambar sekaligus: langsung masukkan semua ke folder
    const batchCards: InfografisCard[] = result.assets.map((asset, idx) => ({
      id: `card-${Date.now()}-${idx}`,
      folderId: activeFolderId,
      kategori: currentFolder?.kategori ?? selectedKategori,
      judul: `${currentFolder?.nama ?? 'Infografis'} #${existingCount + idx + 1}`,
      uri: asset.uri,
      mastered: false,
      createdAt: Date.now() + idx,
    }));

    await saveCards([...cards, ...batchCards]);
  };

  const openEditCardTitle = (card: InfografisCard) => {
    setEditingCard(card);
    setPendingUri(null);
    setCardTitleInput(card.judul);
    setCardModalVisible(true);
  };

  const handleSaveCardModal = async () => {
    const trimmed = cardTitleInput.trim();
    if (!trimmed) return;

    if (editingCard) {
      const updated = cards.map((c) =>
        c.id === editingCard.id ? { ...c, judul: trimmed } : c
      );
      await saveCards(updated);
    } else if (pendingUri && activeFolderId) {
      const currentFolder = folders.find((f) => f.id === activeFolderId);
      const newCard: InfografisCard = {
        id: `card-${Date.now()}`,
        folderId: activeFolderId,
        kategori: currentFolder?.kategori ?? selectedKategori,
        judul: trimmed,
        uri: pendingUri,
        mastered: false,
        createdAt: Date.now(),
      };
      await saveCards([...cards, newCard]);
    }
    setCardModalVisible(false);
  };

  const toggleMastered = async (cardId: string) => {
    const updated = cards.map((c) =>
      c.id === cardId ? { ...c, mastered: !c.mastered } : c
    );
    await saveCards(updated);
  };

  const handleDeleteCard = (card: InfografisCard) => {
    Alert.alert('Hapus Infografis?', `Hapus "${card.judul}" dari folder ini?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await saveCards(cards.filter((c) => c.id !== card.id));
        },
      },
    ]);
  };

  // --- DATA TURUNAN ---
  const visibleFolders = useMemo(
    () => folders.filter((f) => f.kategori === selectedKategori),
    [folders, selectedKategori]
  );

  const activeFolder = useMemo(
    () => folders.find((f) => f.id === activeFolderId) ?? null,
    [folders, activeFolderId]
  );

  const folderCards = useMemo(() => {
    if (!activeFolderId) return [];
    return cards.filter((c) => {
      const matchFolder = c.folderId === activeFolderId;
      const matchReview = !onlyNeedReview || !c.mastered;
      return matchFolder && matchReview;
    });
  }, [cards, activeFolderId, onlyNeedReview]);

  const totalCards = cards.length;
  const masteredCards = cards.filter((c) => c.mastered).length;
  const progressPercent =
    totalCards === 0 ? 0 : Math.round((masteredCards / totalCards) * 100);

  // --- LOGIKA VIEWER LANDSCAPE & ZOOM ---
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetZoom = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  useEffect(() => {
    if (viewerIndex !== null) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      resetZoom();
      setShowHud(true);
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  }, [viewerIndex]);

  const closeViewer = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    setViewerIndex(null);
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, 1), 3.5);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.05) resetZoom();
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.2) {
        resetZoom();
      } else {
        scale.value = withTiming(2.2);
        savedScale.value = 2.2;
      }
    });

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      setShowHud((prev) => !prev);
    });

  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
    singleTapGesture
  );

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const currentViewerCard =
    viewerIndex !== null ? folderCards[viewerIndex] ?? null : null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        {/* HEADER UTAMA */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>GraphSKD</Text>
          <Text style={styles.headerSub}>
            Folder Sub-Materi & Infografis 16:9 Offline
          </Text>

          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Total Infografis Dikuasai</Text>
              <Text style={styles.progressCount}>
                {masteredCards}/{totalCards} ({progressPercent}%)
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
              />
            </View>
          </View>
        </View>

        {/* TAMPILAN 1: DAFTAR FOLDER PER PILAR (TIU / TWK / TKP) */}
        {!activeFolder ? (
          <>
            {/* Tab Kategori TIU / TWK / TKP */}
            <View style={styles.tabRow}>
              {(['TIU', 'TWK', 'TKP'] as KategoriSKD[]).map((kat) => {
                const active = selectedKategori === kat;
                const folderCount = folders.filter((f) => f.kategori === kat).length;
                return (
                  <TouchableOpacity
                    key={kat}
                    style={[styles.tabBtn, active && styles.tabBtnActive]}
                    onPress={() => setSelectedKategori(kat)}
                  >
                    <Text
                      style={[styles.tabBtnText, active && styles.tabBtnTextActive]}
                    >
                      {kat} ({folderCount})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tombol Buat Folder Baru */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Folder Sub-Materi {selectedKategori}
              </Text>
              <TouchableOpacity style={styles.addBtn} onPress={openCreateFolder}>
                <Text style={styles.addBtnText}>+ Folder Baru</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={visibleFolders}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    Belum ada folder sub-materi di {selectedKategori}. Ketuk "+ Folder
                    Baru" untuk membuat.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                const itemsInFolder = cards.filter((c) => c.folderId === item.id);
                const doneCount = itemsInFolder.filter((c) => c.mastered).length;
                return (
                  <TouchableOpacity
                    style={styles.folderCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      setOnlyNeedReview(false);
                      setActiveFolderId(item.id);
                    }}
                  >
                    <View style={styles.folderIconBox}>
                      <Text style={styles.folderIcon}>📁</Text>
                    </View>
                    <View style={styles.folderInfo}>
                      <Text style={styles.folderTitle}>{item.nama}</Text>
                      <Text style={styles.folderMeta}>
                        {itemsInFolder.length} Infografis • {doneCount} Paham
                      </Text>
                    </View>
                    <View style={styles.folderActions}>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => openRenameFolder(item)}
                      >
                        <Text style={styles.iconActionText}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => handleDeleteFolder(item)}
                      >
                        <Text style={[styles.iconActionText, { color: '#F87171' }]}>
                          🗑
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </>
        ) : (
          /* TAMPILAN 2: ISI FOLDER SUB-MATERI & DAFTAR INFOGRAFIS */
          <>
            <View style={styles.folderTopBar}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setActiveFolderId(null)}
              >
                <Text style={styles.backBtnText}>◀ {activeFolder.kategori}</Text>
              </TouchableOpacity>

              <Text style={styles.activeFolderTitle} numberOfLines={1}>
                {activeFolder.nama}
              </Text>

              <TouchableOpacity
                style={styles.addBtn}
                onPress={handlePickInfografis}
              >
                <Text style={styles.addBtnText}>+ Gambar</Text>
              </TouchableOpacity>
            </View>

            {/* Filter Review di dalam Folder */}
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.chip, !onlyNeedReview && styles.chipActive]}
                onPress={() => setOnlyNeedReview(false)}
              >
                <Text
                  style={[
                    styles.chipText,
                    !onlyNeedReview && styles.chipTextActive,
                  ]}
                >
                  Semua ({cards.filter((c) => c.folderId === activeFolder.id).length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, onlyNeedReview && styles.chipReviewActive]}
                onPress={() => setOnlyNeedReview(true)}
              >
                <Text
                  style={[
                    styles.chipText,
                    onlyNeedReview && styles.chipReviewTextActive,
                  ]}
                >
                  Perlu Review
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={folderCards}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    {onlyNeedReview
                      ? 'Semua infografis di folder ini sudah ditandai Paham!'
                      : 'Folder ini masih kosong. Ketuk "+ Gambar" di kanan atas untuk memasukkan infografis 16:9 dari galeri HP.'}
                  </Text>
                </View>
              }
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => setViewerIndex(index)}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{item.judul}</Text>
                    <View style={styles.cardFooterRow}>
                      <TouchableOpacity onPress={() => toggleMastered(item.id)}>
                        <Text
                          style={[
                            styles.statusBadge,
                            item.mastered ? styles.statusDone : styles.statusPending,
                          ]}
                        >
                          {item.mastered ? '✓ Sudah Paham' : '○ Tandai Paham'}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.folderActions}>
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => openEditCardTitle(item)}
                        >
                          <Text style={styles.iconActionText}>✎</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => handleDeleteCard(item)}
                        >
                          <Text style={[styles.iconActionText, { color: '#F87171' }]}>
                            🗑
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </>
        )}

        {/* MODAL BUAT / UBAH NAMA FOLDER */}
        <Modal
          visible={folderModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFolderModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>
                {editingFolder
                  ? 'Ubah Nama Folder'
                  : `Folder Baru di ${selectedKategori}`}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: Silogisme, Deret Angka, UUD 1945..."
                placeholderTextColor="#64748B"
                value={folderNameInput}
                onChangeText={setFolderNameInput}
                autoFocus
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setFolderModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveFolder}
                >
                  <Text style={styles.modalSaveText}>Simpan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL BERI / UBAH JUDUL INFOGRAFIS */}
        <Modal
          visible={cardModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCardModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>
                {editingCard ? 'Ubah Judul Infografis' : 'Judul Infografis Baru'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: Metode Kotak & Bulat"
                placeholderTextColor="#64748B"
                value={cardTitleInput}
                onChangeText={setCardTitleInput}
                autoFocus
              />
              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setCardModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Batal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSaveBtn}
                  onPress={handleSaveCardModal}
                >
                  <Text style={styles.modalSaveText}>Simpan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* MODAL FULLSCREEN LANDSCAPE 16:9 + PINCH ZOOM */}
        <Modal
          visible={currentViewerCard !== null}
          animationType="fade"
          onRequestClose={closeViewer}
        >
          <StatusBar hidden />
          <GestureHandlerRootView style={styles.viewerContainer}>
            {currentViewerCard && (
              <>
                <GestureDetector gesture={composedGesture}>
                  <View style={styles.viewerImageWrap}>
                    <Animated.Image
                      source={{ uri: currentViewerCard.uri }}
                      style={[styles.fullImage, animatedImageStyle]}
                      resizeMode="contain"
                    />
                  </View>
                </GestureDetector>

                {showHud && (
                  <View style={styles.topHud}>
                    <TouchableOpacity style={styles.hudBtn} onPress={closeViewer}>
                      <Text style={styles.hudBtnText}>✕ Tutup</Text>
                    </TouchableOpacity>

                    <View style={styles.hudTitleBox}>
                      <Text style={styles.hudBadge}>
                        {activeFolder?.kategori} • {activeFolder?.nama} (
                        {(viewerIndex ?? 0) + 1}/{folderCards.length})
                      </Text>
                      <Text style={styles.hudTitle} numberOfLines={1}>
                        {currentViewerCard.judul}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.hudBtn,
                        currentViewerCard.mastered && styles.masteredHudBtn,
                      ]}
                      onPress={() => toggleMastered(currentViewerCard.id)}
                    >
                      <Text
                        style={[
                          styles.hudBtnText,
                          currentViewerCard.mastered && styles.masteredHudText,
                        ]}
                      >
                        {currentViewerCard.mastered
                          ? '✓ Sudah Paham'
                          : '○ Tandai Paham'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {showHud && (
                  <View style={styles.bottomHud}>
                    <TouchableOpacity
                      style={[
                        styles.navBtn,
                        (viewerIndex ?? 0) === 0 && styles.navBtnDisabled,
                      ]}
                      disabled={(viewerIndex ?? 0) === 0}
                      onPress={() => {
                        resetZoom();
                        setViewerIndex((prev) => (prev !== null ? prev - 1 : 0));
                      }}
                    >
                      <Text style={styles.hudBtnText}>◀ Sebelumnya</Text>
                    </TouchableOpacity>

                    <Text style={styles.hintText}>
                      Cubit atau ketuk 2x untuk Zoom
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.navBtn,
                        (viewerIndex ?? 0) === folderCards.length - 1 &&
                          styles.navBtnDisabled,
                      ]}
                      disabled={(viewerIndex ?? 0) === folderCards.length - 1}
                      onPress={() => {
                        resetZoom();
                        setViewerIndex((prev) => (prev !== null ? prev + 1 : 0));
                      }}
                    >
                      <Text style={styles.hudBtnText}>Berikutnya ▶</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </GestureHandlerRootView>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  headerSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  progressCard: {
    backgroundColor: '#1B263B',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2B3E5A',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  progressCount: {
    color: '#F5B700',
    fontSize: 12,
    fontWeight: '800',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#0D1B2A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F5B700',
    borderRadius: 4,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: '#1B263B',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2B3E5A',
  },
  tabBtnActive: {
    backgroundColor: '#F5B700',
    borderColor: '#F5B700',
  },
  tabBtnText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '800',
  },
  tabBtnTextActive: {
    color: '#0D1B2A',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
  },
  addBtn: {
    backgroundColor: '#F5B700',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#0D1B2A',
    fontSize: 12,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 10,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B263B',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2B3E5A',
  },
  folderIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#0D1B2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  folderIcon: {
    fontSize: 20,
  },
  folderInfo: {
    flex: 1,
  },
  folderTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  folderMeta: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  folderActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconActionBtn: {
    backgroundColor: '#0D1B2A',
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2B3E5A',
  },
  iconActionText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '700',
  },
  folderTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 10,
    marginBottom: 10,
  },
  backBtn: {
    backgroundColor: '#1B263B',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#415A77',
  },
  backBtnText: {
    color: '#F5B700',
    fontSize: 12,
    fontWeight: '800',
  },
  activeFolderTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    backgroundColor: '#1B263B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2B3E5A',
  },
  chipActive: {
    backgroundColor: '#F5B700',
    borderColor: '#F5B700',
  },
  chipText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#0D1B2A',
  },
  chipReviewActive: {
    backgroundColor: '#7F1D1D',
    borderColor: '#EF4444',
  },
  chipReviewTextActive: {
    color: '#FECACA',
  },
  card: {
    backgroundColor: '#1B263B',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2B3E5A',
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#070E1A',
  },
  cardBody: {
    padding: 12,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  statusDone: {
    backgroundColor: '#1B4332',
    color: '#95D5B2',
  },
  statusPending: {
    backgroundColor: '#334155',
    color: '#E2E8F0',
  },
  emptyBox: {
    padding: 28,
    backgroundColor: '#1B263B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2B3E5A',
    alignItems: 'center',
  },
  emptyText: {
    color: '#94A3B8',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 14, 26, 0.8)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: '#1B263B',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#415A77',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#0D1B2A',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2B3E5A',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  modalCancelText: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  modalSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#F5B700',
  },
  modalSaveText: {
    color: '#0D1B2A',
    fontWeight: '800',
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#070E1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImageWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  topHud: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(13, 27, 42, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E3A5F',
  },
  hudTitleBox: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  hudBadge: {
    color: '#F5B700',
    fontSize: 11,
    fontWeight: '700',
  },
  hudTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  hudBtn: {
    backgroundColor: '#1B263B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#415A77',
  },
  hudBtnText: {
    color: '#E0E1DD',
    fontSize: 12,
    fontWeight: '700',
  },
  masteredHudBtn: {
    backgroundColor: '#1B4332',
    borderColor: '#40916C',
  },
  masteredHudText: {
    color: '#95D5B2',
  },
  bottomHud: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navBtn: {
    backgroundColor: 'rgba(27, 38, 59, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#415A77',
  },
  navBtnDisabled: {
    opacity: 0.35,
  },
  hintText: {
    color: '#94A3B8',
    fontSize: 11,
    backgroundColor: 'rgba(7, 14, 26, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
});