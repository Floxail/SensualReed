import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useColors, useThemeToggle, Spacing, BorderRadius, Typography } from '../theme';
import { RootStackParamList } from '../types';
import { useLibraryStore, LibraryBook } from '../store/useLibraryStore';
import { bulkImportService, epubCoverExtractor, ImportCandidate } from '../services/library';
import { copyBookToLibrary, getLibraryPath } from '../store/useLibraryStore';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ConnectionStatus } from '../components/ConnectionStatus';

type HomeNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_PADDING = 12;
const GRID_GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 2) / 3;
const COVER_HEIGHT = CARD_WIDTH * 1.52;

const FORMAT_COLORS: Record<string, string> = {
  epub: '#FF4D7D',
  txt: '#4CAF50',
  pdf: '#2196F3',
  cbz: '#FF9800',
  cbr: '#9C27B0',
};

const BookGridCard: React.FC<{
  book: LibraryBook;
  onPress: () => void;
  onLongPress: () => void;
  colors: any;
}> = ({ book, onPress, onLongPress, colors }) => {
  const progress = book.totalPages > 0
    ? Math.round((book.currentPage / book.totalPages) * 100)
    : 0;

  const format = book.fileType || (book.filePath?.toLowerCase().endsWith('.epub') ? 'epub' : 'txt');
  const badgeColor = FORMAT_COLORS[format] || colors.primary;

  const coverBg = book.coverColor || colors.surface;

  return (
    <TouchableOpacity
      style={[styles.gridCard, { backgroundColor: coverBg }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
    >
      {/* Cover */}
      <View style={styles.coverContainer}>
        {book.coverImagePath ? (
          <Image
            source={{ uri: `file://${book.coverImagePath}` }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: coverBg }]}>
            <Text style={styles.coverEmoji}>📚</Text>
          </View>
        )}

        {/* Format badge — top right */}
        <View style={[styles.formatBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.formatBadgeText}>{format.toUpperCase()}</Text>
        </View>

        {/* Progress % — top left (only if started) */}
        {progress > 0 && (
          <View style={[styles.progressBadge, { backgroundColor: 'rgba(0,0,0,0.62)' }]}>
            <Text style={styles.progressBadgeText}>{progress}%</Text>
          </View>
        )}

        {/* Progress bar — bottom of cover */}
        <View style={styles.coverProgressTrack}>
          <View
            style={[
              styles.coverProgressFill,
              { width: `${progress}%`, backgroundColor: colors.primary },
            ]}
          />
        </View>
      </View>

      {/* Title */}
      <View style={[styles.cardFooter, { backgroundColor: colors.card }]}>
        <Text
          style={[styles.cardTitle, { color: colors.text }]}
          numberOfLines={2}
        >
          {book.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export const HomeScreen: React.FC = () => {
  const colors = useColors();
  const { isDark } = useThemeToggle();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavigationProp>();
  const { books, removeBook, addBook, updateCover } = useLibraryStore();

  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const handleBookPress = (book: LibraryBook) => {
    navigation.navigate('Reader', { bookId: book.id });
  };

  const handleBookLongPress = (book: LibraryBook) => {
    Alert.alert(
      'Supprimer le livre ?',
      `Voulez-vous supprimer "${book.title}" de votre bibliothèque ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => removeBook(book.id),
        },
      ]
    );
  };

  const hasBooks = books.length > 0;

  const handleScanFolder = async () => {
    setScanModalVisible(true);
    setScanning(true);
    setCandidates([]);
    setSelected(new Set());

    const granted = await bulkImportService.requestStoragePermission();
    if (!granted) {
      setScanning(false);
      Alert.alert('Permission refusée', 'Accès au stockage requis pour scanner les dossiers.');
      setScanModalVisible(false);
      return;
    }

    const found = await bulkImportService.scanAllDefaultDirs();
    const existingPaths = new Set(books.map((b) => b.filePath));
    const fresh = found.filter((c) => !existingPaths.has(c.path));
    setCandidates(fresh);
    setSelected(new Set(fresh.map((c) => c.path)));
    setScanning(false);
  };

  const handleBulkImport = async () => {
    setImporting(true);
    const toImport = candidates.filter((c) => selected.has(c.path));

    for (const candidate of toImport) {
      try {
        const localPath = await copyBookToLibrary(candidate.path, candidate.name);
        const title = candidate.name.replace(/\.(epub|txt)$/i, '');
        const newBook = addBook({
          title,
          author: 'Inconnu',
          filePath: localPath,
          fileName: candidate.name,
          fileType: candidate.type,
          totalPages: 0,
        });
        if (candidate.type === 'epub') {
          epubCoverExtractor.extractCover(localPath, newBook.id, getLibraryPath())
            .then((p) => { if (p) updateCover(newBook.id, p); })
            .catch(() => {});
        }
      } catch {
        // skip on error
      }
    }

    setImporting(false);
    setScanModalVisible(false);
    Alert.alert('Importation terminée', `${toImport.length} livre(s) ajouté(s).`);
  };

  return (
    <ErrorBoundary screenName="HomeScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={colors.primary}
        />

        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.primary, paddingTop: insets.top + 8 }]}>
          <View style={styles.headerTop}>
            <Text style={[styles.title, { color: colors.textOnPrimary }]}>SensualRead</Text>
            <View style={styles.headerRight}>
              <ConnectionStatus />
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => navigation.navigate('Settings')}
              >
                <Text style={styles.settingsIcon}>⚙</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: colors.primaryLight }]}>
            {hasBooks ? `${books.length} livre${books.length > 1 ? 's' : ''}` : 'Your Personal E-Reader'}
          </Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.buttonPrimary }]}
              onPress={() => navigation.navigate('Reader', undefined)}
            >
              <Text style={styles.actionIcon}>➕</Text>
              <Text style={[styles.actionText, { color: colors.textOnPrimary }]}>Nouveau</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate('DeviceTest')}
            >
              <Text style={styles.actionIcon}>📳</Text>
              <Text style={[styles.actionText, { color: colors.text }]}>Connexion</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.surface }]}
              onPress={handleScanFolder}
            >
              <Text style={styles.actionIcon}>🔍</Text>
              <Text style={[styles.actionText, { color: colors.text }]}>Scanner</Text>
            </TouchableOpacity>
          </View>

          {/* Library */}
          {hasBooks ? (
            <View style={styles.library}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Ma bibliothèque
              </Text>
              <View style={styles.grid}>
                {books.map((book) => (
                  <BookGridCard
                    key={book.id}
                    book={book}
                    onPress={() => handleBookPress(book)}
                    onLongPress={() => handleBookLongPress(book)}
                    colors={colors}
                  />
                ))}
              </View>
            </View>
          ) : (
            /* Empty state */
            <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
              <Text style={styles.emptyIcon}>📚</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                Bibliothèque vide
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                Importez un fichier EPUB ou TXT pour commencer
              </Text>
              <TouchableOpacity
                style={[styles.emptyImportBtn, { backgroundColor: colors.primary }]}
                onPress={() => navigation.navigate('Reader', undefined)}
              >
                <Text style={[styles.emptyImportBtnText, { color: colors.textOnPrimary }]}>
                  ➕  Importer un livre
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: Spacing.xl }} />
        </ScrollView>

        {/* Scan modal */}
        <Modal
          visible={scanModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setScanModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Scanner les livres</Text>

              {scanning ? (
                <View style={styles.modalCenter}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Recherche en cours…</Text>
                </View>
              ) : candidates.length === 0 ? (
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Aucun nouveau livre trouvé.</Text>
              ) : (
                <FlatList
                  data={candidates}
                  keyExtractor={(item) => item.path}
                  style={styles.candidateList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.candidateRow}
                      onPress={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.path)) next.delete(item.path);
                          else next.add(item.path);
                          return next;
                        });
                      }}
                    >
                      <View style={[
                        styles.checkbox,
                        selected.has(item.path) && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.candidateName, { color: colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.candidateSize, { color: colors.textSecondary }]}>
                          {item.sizeKB} KB · {item.type.toUpperCase()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: colors.border }]}
                  onPress={() => setScanModalVisible(false)}
                >
                  <Text style={{ color: colors.text }}>Annuler</Text>
                </TouchableOpacity>
                {!scanning && candidates.length > 0 && (
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                    onPress={handleBulkImport}
                    disabled={importing || selected.size === 0}
                  >
                    {importing
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: '#fff' }}>Importer ({selected.size})</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  headerTop: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerRight: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  settingsButton: { padding: Spacing.sm },
  settingsIcon: { fontSize: 22, color: '#fff' },
  title: { ...Typography.h1 },
  subtitle: { ...Typography.body, marginTop: Spacing.xs },
  content: { flex: 1, padding: GRID_PADDING },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.lg,
    gap: 4,
  },
  actionIcon: { fontSize: 16 },
  actionText: { ...Typography.caption, fontWeight: '600' },
  library: { marginTop: Spacing.xs },
  sectionTitle: { ...Typography.h3, marginBottom: Spacing.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridCard: {
    width: CARD_WIDTH,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  coverContainer: {
    width: CARD_WIDTH,
    height: COVER_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverEmoji: { fontSize: 28 },
  formatBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  formatBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  progressBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  coverProgressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  coverProgressFill: {
    height: '100%',
  },
  cardFooter: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  // Empty state
  emptyState: {
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 56, marginBottom: Spacing.md },
  emptyTitle: { ...Typography.h3, marginBottom: Spacing.sm, textAlign: 'center' },
  emptySubtitle: { ...Typography.body, textAlign: 'center', marginBottom: Spacing.xl },
  emptyImportBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
  },
  emptyImportBtnText: { ...Typography.button },
  // Scan modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  modalSubtitle: { fontSize: 14, textAlign: 'center', marginVertical: 20 },
  modalCenter: { alignItems: 'center', paddingVertical: 20 },
  candidateList: { maxHeight: 300, marginBottom: 12 },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
  },
  candidateName: { fontSize: 14, fontWeight: '500' },
  candidateSize: { fontSize: 12, marginTop: 2 },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
});

export default HomeScreen;
