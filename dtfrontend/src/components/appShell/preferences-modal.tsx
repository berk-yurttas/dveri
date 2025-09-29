"use client"

import { Bell, Settings, Shield, Volume2, Mail, Moon, Sun, Globe } from "lucide-react"

import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Switch } from "./ui/switch"
import { Label } from "./ui/label"
import { Separator } from "./ui/separator"

interface PreferencesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PreferencesModal({ open, onOpenChange }: PreferencesModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Preferences
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="notifications" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Bildirimler
            </TabsTrigger>
            <TabsTrigger value="session" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Oturum Ayarları
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="notifications" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Bildirim Ayarları
                </CardTitle>
                <CardDescription>
                  Bildirimleri nasıl almak istediğinizi seçin
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      E-posta Bildirimleri
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Önemli güncellemeler için e-posta alın
                    </p>
                  </div>
                  <Switch />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      Ses Bildirimleri
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Sistem olayları için ses bildirimleri
                    </p>
                  </div>
                  <Switch />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Bell className="h-4 w-4" />
                      Tarayıcı Bildirimleri
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Tarayıcı bildirimleri göster
                    </p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="session" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Oturum Güvenliği
                </CardTitle>
                <CardDescription>
                  Oturum güvenliği ve erişim ayarlarınızı yönetin
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Otomatik Oturum Kapatma</Label>
                    <p className="text-sm text-muted-foreground">
                      Uzun süre hareketsizlik durumunda otomatik çıkış
                    </p>
                  </div>
                  <Switch />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Oturum Hatırlatma</Label>
                    <p className="text-sm text-muted-foreground">
                      Sonraki girişlerde beni hatırla
                    </p>
                  </div>
                  <Switch />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Çoklu Oturum
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Aynı anda birden fazla cihazda oturum açma
                    </p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Tema Ayarları</CardTitle>
                <CardDescription>
                  Uygulama görünümünü özelleştirin
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      Karanlık Tema
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Koyu renk şeması kullan
                    </p>
                  </div>
                  <Switch />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}